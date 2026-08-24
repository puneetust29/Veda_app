"""Minimal httpx client for the uber-mcp local server.

Mints a short-lived HS256 JWT and calls /mcp via Streamable HTTP transport
(JSON-RPC POST with Accept: application/json, text/event-stream).

Environment variables (add to backend/.env):
  UBER_MCP_URL        URL of the uber-mcp server  (default: http://localhost:3001)
  UBER_MCP_JWT_SECRET Hex string matching MCP_JWT_SECRET in uber-mcp/.env
  UBER_MCP_USER_SUB   userSub captured after Uber login (e.g. uber_68f76b3...)
  UBER_MCP_CLIENT_ID  clientId from the OAuth registration
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx
from jose import jwt

from app.config import get_settings

logger = logging.getLogger(__name__)

_TOKEN_TTL = 3600


def _cfg() -> tuple[str, str, str, str]:
    s = get_settings()
    return s.uber_mcp_url, s.uber_mcp_jwt_secret, s.uber_mcp_user_sub, s.uber_mcp_client_id


def _mint_token() -> str:
    mcp_url, jwt_secret, user_sub, client_id = _cfg()
    now = int(time.time())
    payload = {
        "client_id": client_id,
        "scope": "mcp:tools",
        "iss": f"{mcp_url}/",
        "aud": f"{mcp_url}/mcp",
        "sub": user_sub,
        "iat": now,
        "exp": now + _TOKEN_TTL,
    }
    # Server encodes the secret as raw UTF-8 bytes of the hex string
    secret_bytes = jwt_secret.encode("utf-8")
    return jwt.encode(payload, secret_bytes, algorithm="HS256", headers={"typ": "at+jwt"})


def _parse_sse(body: str) -> Any:
    """Extract the JSON payload from an SSE response body."""
    for line in body.splitlines():
        if line.startswith("data: "):
            try:
                return json.loads(line[6:])
            except json.JSONDecodeError:
                pass
    return None


def call_tool(name: str, arguments: dict[str, Any], timeout: float = 20.0) -> dict[str, Any]:
    """Call a single uber-mcp tool and return the parsed result dict.

    Returns the full JSON-RPC response dict.  Raises on HTTP or timeout errors.
    """
    mcp_url, jwt_secret, user_sub, _ = _cfg()
    if not jwt_secret or not user_sub:
        raise RuntimeError(
            "UBER_MCP_JWT_SECRET and UBER_MCP_USER_SUB must be set in backend/.env"
        )

    token = _mint_token()
    payload = json.dumps({"jsonrpc": "2.0", "method": "tools/call", "params": {"name": name, "arguments": arguments}, "id": 1})

    with httpx.Client(timeout=timeout) as client:
        resp = client.post(
            f"{mcp_url}/mcp",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "Authorization": f"Bearer {token}",
            },
        )
        resp.raise_for_status()
        parsed = _parse_sse(resp.text)
        if parsed is None:
            raise ValueError(f"Could not parse SSE response: {resp.text[:200]}")
        return parsed


def call_tool_as(access_token: str, name: str, arguments: dict[str, Any], timeout: float = 20.0) -> dict[str, Any]:
    """Call a tool using a per-user access_token obtained from the OAuth flow.

    Use this instead of call_tool() when the caller has a user-specific token
    from uber_oauth.exchange_code() / uber_oauth.refresh_tokens().
    """
    mcp_url, _, _, _ = _cfg()
    payload = json.dumps({"jsonrpc": "2.0", "method": "tools/call", "params": {"name": name, "arguments": arguments}, "id": 1})

    with httpx.Client(timeout=timeout) as client:
        resp = client.post(
            f"{mcp_url}/mcp",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
                "Authorization": f"Bearer {access_token}",
            },
        )
        resp.raise_for_status()
        parsed = _parse_sse(resp.text)
        if parsed is None:
            raise ValueError(f"Could not parse SSE response: {resp.text[:200]}")
        return parsed


def is_configured() -> bool:
    _, jwt_secret, user_sub, client_id = _cfg()
    return bool(jwt_secret and user_sub and client_id)
