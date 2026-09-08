"""UberAgent: suggests an Uber ride for an upcoming flight via official deep-link API."""
from __future__ import annotations

import asyncio
import logging
import pathlib

from app.agents.base.contracts import AgentContext, AgentMode, AgentResult, BaseAgent
from app.agents.base.manifest import load_manifest
from app.agents.base.runner import run_graph_streaming
from app.agents.uber.graph import uber_graph
from app.agents.uber.schemas import UberRideSuggestionCard
from app.agents.uber.state import UberAgentState
from app.agents.uber.stream_map import build_done, build_recommendation_ready, translate

logger = logging.getLogger(__name__)

_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"


class UberAgent(BaseAgent):
    def __init__(self) -> None:
        self.manifest = load_manifest(_MANIFEST_PATH)

    def _initial_state(self, ctx: AgentContext) -> UberAgentState:
        customer = ctx.context.get("customer")
        calendar_event = ctx.context.get("calendar_event")
        state: UberAgentState = {
            "run_id": ctx.run_id,
            "customer_id": (customer or {}).get("id"),
            "conversation_id": ctx.conversation_id,
            "mode": ctx.mode,
            "context": ctx.context,
            "customer": customer,
            "calendar_event": calendar_event,
            "device_location": ctx.context.get("device_location"),
        }
        return state

    def execute(self, ctx: AgentContext, mode: AgentMode = "suggest") -> AgentResult:
        state = self._initial_state(ctx)
        logger.info(
            "uber agent start | run_id=%s | customer_id=%s | has_calendar_event=%s",
            ctx.run_id, state.get("customer_id"), bool(state.get("calendar_event")),
        )

        if mode == "converse":
            def _forward(payload: dict) -> None:
                for event in translate("custom", payload):
                    ctx.emit(event)

            final_state = asyncio.run(run_graph_streaming(uber_graph, state, _forward))
        else:
            final_state = uber_graph.invoke(state)

        card = UberRideSuggestionCard(
            origin_type=final_state.get("origin_type", "airport"),
            reasoning=final_state.get("reasoning", ""),
            suggested_message=final_state.get("suggested_message", ""),
            pickup_label=final_state.get("pickup_label"),
            dropoff_label=final_state.get("dropoff_label"),
            uber_app_url=final_state.get("uber_app_url"),
            deep_link_url=final_state.get("deep_link_url"),
            airport_options=final_state.get("airport_options", []),
            alternative_options=final_state.get("alternative_options", []),
            drive_mins_to_airport=final_state.get("drive_mins_to_airport"),
        ).model_dump()

        logger.info(
            "uber agent complete | run_id=%s | origin_type=%s | has_deeplink=%s | airport_options=%d",
            ctx.run_id,
            final_state.get("origin_type"),
            bool(final_state.get("uber_app_url") or final_state.get("deep_link_url")),
            len(final_state.get("airport_options", [])),
        )

        ctx.emit(build_recommendation_ready(card))
        ctx.emit(build_done("ok_no_action"))

        return AgentResult(
            agent=self.manifest.name,
            version=self.manifest.version,
            status="ok",
            summary=final_state.get("suggested_message", ""),
            cards=[card],
            proposed_actions=[],
            raw=final_state,
        )


AGENT = UberAgent()
