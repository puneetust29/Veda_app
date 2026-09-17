"""Event translation and helpers for veda agent."""
from __future__ import annotations

from typing import Any, List


def translate(mode: str, payload: Any) -> List[dict]:
    """Translate one (mode, payload) chunk from `graph.stream(..., stream_mode=[...])`
    into zero or more AgentEvent-shaped dicts. Only "custom" chunks (the ones nodes
    push via `writer({...})`) carry user-facing events for this agent.

    Writers can pass a nested `payload` key to preserve inner dicts that also use
    a `kind` field (e.g. location_action wraps a LocationAction which has its own
    `kind`). When `payload` is present it becomes `data` verbatim; otherwise `data`
    is the writer dict minus the routing `kind`.
    """
    if mode != "custom":
        return []
    if not isinstance(payload, dict) or "kind" not in payload:
        return []
    kind = payload["kind"]
    if "payload" in payload:
        data = payload["payload"]
    else:
        data = {k: v for k, v in payload.items() if k != "kind"}
    return [{"type": kind, "data": data}]


def build_done(status: str) -> dict:
    """status is 'ok_no_action' for a completed reply."""
    return {"type": "done", "data": {"status": status}}


def build_error(code: str, retryable: bool = False) -> dict:
    return {"type": "error", "data": {"code": code, "retryable": retryable}}
