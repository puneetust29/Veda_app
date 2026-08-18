"""Node -> stream event translation for the roaming agent.

Final reconciled event type set (do not add others without updating the mobile
contract too): run_started, status, tool_started, tool_completed,
recommendation_ready, confirmation_required, error, done.

`translate(mode, payload)` converts a raw LangGraph custom-stream-mode chunk (exactly
what a node's `writer({...})` call passed, e.g. {"kind": "status", "text": "..."}) into
the wire `AgentEvent`-shaped dict {"type": ..., "data": {...}}. The `build_*` helpers
construct the events RoamingAgent.execute() emits itself, after the graph finishes
(these aren't graph-stream chunks, so they don't go through `translate`).
"""
from __future__ import annotations

from typing import Any, List


def translate(mode: str, payload: Any) -> List[dict]:
    """Translate one (mode, payload) chunk from `graph.stream(..., stream_mode=[...])`
    into zero or more AgentEvent-shaped dicts. Only "custom" chunks (the ones nodes
    push via `writer({...})`) carry user-facing events for this agent."""
    if mode != "custom":
        return []
    if not isinstance(payload, dict) or "kind" not in payload:
        return []
    kind = payload["kind"]
    data = {k: v for k, v in payload.items() if k != "kind"}
    return [{"type": kind, "data": data}]


def build_recommendation_ready(card: dict) -> dict:
    return {"type": "recommendation_ready", "data": {"card": card}}


def build_confirmation_required(action_id: str, plan: dict, calendar_event: dict) -> dict:
    price = plan.get("price")
    currency = plan.get("currency", "")
    plan_name = plan.get("plan_name", "this plan")
    summary = f"Activate {plan_name} — {price} {currency}".strip()
    return {
        "type": "confirmation_required",
        "data": {
            "action_id": action_id,
            "summary": summary,
            "risk": "commit",
            "plan_id": plan.get("id"),
            "calendar_event_id": calendar_event.get("id"),
        },
    }


def build_error(code: str, retryable: bool = False) -> dict:
    return {"type": "error", "data": {"code": code, "retryable": retryable}}


def build_done(status: str) -> dict:
    """`status` is one of "awaiting_approval" (a commit-risk action is pending
    confirmation) or "ok_no_action" (recommendation delivered, or none found, with
    nothing further for the user to approve)."""
    return {"type": "done", "data": {"status": status}}
