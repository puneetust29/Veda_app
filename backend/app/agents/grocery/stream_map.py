"""Stream event helpers for the grocery agent."""
from __future__ import annotations

from typing import Any, List


def translate(mode: str, payload: Any) -> List[dict]:
    if mode != "custom":
        return []
    if not isinstance(payload, dict) or "kind" not in payload:
        return []
    kind = payload["kind"]
    data = {k: v for k, v in payload.items() if k != "kind"}
    return [{"type": kind, "data": data}]


def build_done(status: str) -> dict:
    return {"type": "done", "data": {"status": status}}


def build_error(code: str, message: str = "", retryable: bool = False) -> dict:
    return {"type": "error", "data": {"code": code, "message": message, "retryable": retryable}}
