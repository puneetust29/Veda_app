"""Node → stream event translation for the Uber agent.

Mirrors roaming/stream_map.py exactly in structure. The same wire event type set
applies: run_started, status, tool_started, tool_completed,
recommendation_ready, error, done.

`translate` handles raw LangGraph custom-stream-mode chunks (writer({...}) calls).
`build_*` helpers construct events UberAgent.execute() emits after the graph finishes.
"""
from __future__ import annotations

from typing import Any, List


def translate(mode: str, payload: Any) -> List[dict]:
    """Translate one LangGraph stream chunk into zero or more AgentEvent dicts.
    Only 'custom' chunks (from writer({...})) carry user-facing events."""
    if mode != "custom":
        return []
    if not isinstance(payload, dict) or "kind" not in payload:
        return []
    kind = payload["kind"]
    data = {k: v for k, v in payload.items() if k != "kind"}
    return [{"type": kind, "data": data}]


def build_recommendation_ready(card: dict) -> dict:
    return {"type": "recommendation_ready", "data": {"card": card}}


def build_error(code: str, retryable: bool = False, message: str = "") -> dict:
    return {"type": "error", "data": {"code": code, "retryable": retryable, "message": message}}


def build_done(status: str) -> dict:
    return {"type": "done", "data": {"status": status}}
