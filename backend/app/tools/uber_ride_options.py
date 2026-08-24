"""Fetch live Uber ride prices for a trip without going through the full chat
orchestration/LLM routing — just runs the uber_agent's graph directly.

Lives in app/tools/ (not called from app/routers/conversation.py's agent-import
guard) so both routers/uber.py (GET /uber/options) and routers/conversation.py
(refreshing the ride card right after a chat-driven Uber login completes) can
reuse it without conversation.py importing a concrete agent module — see the
docstring in routers/conversation.py for why that boundary matters.
"""
from __future__ import annotations

from typing import Optional


def fetch(customer: dict, calendar_event: dict, device_location: Optional[dict]) -> dict:
    from app.agents.uber.graph import uber_graph  # local import: keep agent modules out of callers' import graph

    state = {
        "customer_id": customer["id"],
        "customer": customer,
        "calendar_event": calendar_event,
        "device_location": device_location,
    }
    final_state = uber_graph.invoke(state)

    return {
        "origin_type": final_state.get("origin_type", "airport"),
        "pickup_label": final_state.get("pickup_label"),
        "dropoff_label": final_state.get("dropoff_label"),
        "uber_app_url": final_state.get("uber_app_url"),
        "deep_link_url": final_state.get("deep_link_url"),
        "airport_options": final_state.get("airport_options", []),
        "alternative_options": final_state.get("alternative_options", []),
        "ride_products": final_state.get("ride_offers", []),
        "live_quote": final_state.get("live_quote"),
        "connect_uber_url": final_state.get("connect_uber_url"),
        "suggested_message": final_state.get("suggested_message", ""),
        "reasoning": final_state.get("reasoning", ""),
    }
