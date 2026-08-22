from __future__ import annotations

import json
import logging
import queue
import subprocess
import threading
from typing import Any, Optional

logger = logging.getLogger(__name__)


class McpClientError(RuntimeError):
    """Raised when an MCP stdio session cannot complete a request."""


def _encode_message(payload: dict) -> str:
    return json.dumps(payload) + "\n"


class StdioMcpClient:
    """Minimal JSON-RPC-over-stdio MCP client used by the Uber MCP wrapper."""

    def __init__(
        self,
        *,
        command: str,
        args: list[str],
        env: dict[str, str],
        timeout_seconds: float = 20.0,
        protocol_version: str = "2024-11-05",
    ) -> None:
        self._command = command
        self._args = args
        self._env = env
        self._timeout_seconds = timeout_seconds
        self._protocol_version = protocol_version
        self._process: Optional[subprocess.Popen[str]] = None
        self._responses: dict[Any, queue.Queue[Optional[dict[str, Any]]]] = {}
        self._response_lock = threading.Lock()
        self._reader_thread: Optional[threading.Thread] = None
        self._stderr_thread: Optional[threading.Thread] = None
        self._next_id = 1

    def __enter__(self) -> "StdioMcpClient":
        logger.info(
            "mcp process start | command=%s | args=%s | timeout_seconds=%.1f | protocol_version=%s",
            self._command,
            self._args,
            self._timeout_seconds,
            self._protocol_version,
        )
        try:
            self._process = subprocess.Popen(
                [self._command, *self._args],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=self._env,
                text=True,
                encoding="utf-8",
                bufsize=1,
            )
        except OSError as exc:
            logger.exception("mcp process failed to start | command=%s | args=%s", self._command, self._args)
            raise McpClientError(f"failed to start MCP process: {exc}") from exc

        self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._reader_thread.start()

        self._stderr_thread = threading.Thread(target=self._stderr_loop, daemon=True)
        self._stderr_thread.start()

        self.initialize()
        logger.info("mcp process initialized | pid=%s", self._process.pid if self._process else None)
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if not self._process:
            return
        pid = self._process.pid
        if self._process.poll() is None:
            logger.info("mcp process terminate | pid=%s", pid)
            self._process.terminate()
            try:
                self._process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                logger.warning("mcp process kill after timeout | pid=%s", pid)
                self._process.kill()
                self._process.wait(timeout=2)
        self._fail_pending_responses(None)
        logger.info("mcp process exited | pid=%s | returncode=%s", pid, self._process.returncode)
        self._process = None

    def _fail_pending_responses(self, payload: Optional[dict[str, Any]]) -> None:
        with self._response_lock:
            queues = list(self._responses.values())
            self._responses.clear()
        for response_queue in queues:
            response_queue.put(payload)

    def _stderr_loop(self) -> None:
        if not self._process or not self._process.stderr:
            return
        for line in self._process.stderr:
            line = line.rstrip()
            if line:
                logger.debug("mcp stderr | %s", line)

    def _reader_loop(self) -> None:
        if not self._process or not self._process.stdout:
            return
        stream = self._process.stdout
        try:
            for raw_line in stream:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    logger.debug("mcp stdout non-json line ignored | line=%r", line)
                    continue

                response_id = payload.get("id")
                logger.debug(
                    "mcp response queued | id=%s | keys=%s",
                    response_id,
                    sorted(payload.keys()),
                )
                if response_id is None:
                    logger.debug("mcp notification received | keys=%s", sorted(payload.keys()))
                    continue

                with self._response_lock:
                    response_queue = self._responses.get(response_id)
                if response_queue is not None:
                    response_queue.put(payload)
                else:
                    logger.debug("mcp response dropped | id=%s | reason=no_waiter", response_id)

            logger.warning("mcp reader detected stdout close")
            self._fail_pending_responses(None)
        except Exception as exc:  # pragma: no cover - defensive reader shutdown
            logger.exception("mcp reader loop failed: %s", exc)
            self._fail_pending_responses({"error": {"message": str(exc)}})

    def _send(self, payload: dict) -> None:
        if not self._process or not self._process.stdin:
            raise McpClientError("MCP process is not running")
        logger.info(
            "mcp send | method=%s | id=%s",
            payload.get("method"),
            payload.get("id"),
        )
        try:
            self._process.stdin.write(_encode_message(payload))
            self._process.stdin.flush()
        except OSError as exc:
            logger.exception(
                "mcp write failed | method=%s | id=%s",
                payload.get("method"),
                payload.get("id"),
            )
            raise McpClientError(f"failed to write to MCP process: {exc}") from exc

    def _wait_for_response(self, request_id: int) -> dict:
        with self._response_lock:
            response_queue = self._responses.setdefault(request_id, queue.Queue())
        try:
            try:
                payload = response_queue.get(timeout=self._timeout_seconds)
            except queue.Empty as exc:
                logger.warning("mcp response timeout | request_id=%s", request_id)
                raise McpClientError(f"timed out waiting for MCP response to request {request_id}") from exc
        finally:
            with self._response_lock:
                self._responses.pop(request_id, None)

        if payload is None:
            logger.warning("mcp process exited before response | request_id=%s", request_id)
            raise McpClientError("MCP process exited before sending a response")

        if "error" in payload:
            error = payload["error"]
            if isinstance(error, dict):
                message = error.get("message", "unknown MCP error")
            else:
                message = str(error)
            logger.warning("mcp error response | request_id=%s | error=%s", request_id, message)
            raise McpClientError(message)

        logger.info("mcp response received | request_id=%s", request_id)
        return payload.get("result", {})

    def request(self, method: str, params: Optional[dict] = None) -> dict:
        request_id = self._next_id
        self._next_id += 1
        self._send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": method,
                "params": params or {},
            }
        )
        return self._wait_for_response(request_id)

    def notify(self, method: str, params: Optional[dict] = None) -> None:
        self._send(
            {
                "jsonrpc": "2.0",
                "method": method,
                "params": params or {},
            }
        )

    def initialize(self) -> dict:
        logger.info("mcp initialize start")
        result = self.request(
            "initialize",
            {
                "protocolVersion": self._protocol_version,
                "capabilities": {},
                "clientInfo": {"name": "veda-backend", "version": "0.1.0"},
            },
        )
        self.notify("notifications/initialized", {})
        logger.info("mcp initialize complete")
        return result

    def list_tools(self) -> list[dict[str, Any]]:
        logger.info("mcp tools/list start")
        result = self.request("tools/list", {})
        tools = list(result.get("tools", []))
        logger.info("mcp tools/list complete | count=%d", len(tools))
        return tools

    def call_tool(self, name: str, arguments: Optional[dict] = None) -> dict:
        logger.info("mcp tool call start | tool=%s", name)
        result = self.request("tools/call", {"name": name, "arguments": arguments or {}})
        logger.info("mcp tool call complete | tool=%s", name)
        return result
