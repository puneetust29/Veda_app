"""UberAgent: suggests an Uber ride for an upcoming flight.

Uses official Uber deep-link API (m.uber.com/ul/) to hand off to the native Uber app.
No third-party dependencies or API approval required.

No server-side booking implemented. Deep link opens Uber app where user completes the
booking themselves.
"""
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
from app.agents.uber.stream_map import (
    build_done,
    build_error,
    build_recommendation_ready,
    translate,
)

logger = logging.getLogger(__name__)

_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"


class UberAgent(BaseAgent):
    def __init__(self) -> None:
        self.manifest = load_manifest(_MANIFEST_PATH)

    def _initial_state(self, ctx: AgentContext) -> UberAgentState:
        customer = ctx.context.get("customer")
        calendar_event = ctx.context.get("calendar_event")
        device_location = ctx.context.get("device_location")
        state: UberAgentState = {
            "run_id": ctx.run_id,
            "customer_id": (customer or {}).get("id"),
            "conversation_id": ctx.conversation_id,
            "mode": ctx.mode,
            "context": ctx.context,
            "customer": customer,
            "calendar_event": calendar_event,
            "device_location": device_location,
        }
        return state

    def execute(self, ctx: AgentContext, mode: AgentMode = "suggest") -> AgentResult:
        state = self._initial_state(ctx)
        logger.info(
            "uber agent execute start | run_id=%s | conversation_id=%s | mode=%s | customer_id=%s | has_calendar_event=%s | has_device_location=%s",
            ctx.run_id,
            ctx.conversation_id,
            mode,
            state.get("customer_id"),
            bool(state.get("calendar_event")),
            bool(state.get("device_location")),
        )

        if mode == "converse":
            def _forward_translated(payload: dict) -> None:
                for event in translate("custom", payload):
                    ctx.emit(event)

            # Run graph in a fresh asyncio loop scoped to this worker thread,
            # exactly as RoamingAgent does (see roaming/agent.py for the rationale).
            final_state = asyncio.run(
                run_graph_streaming(uber_graph, state, _forward_translated)
            )
        else:
            final_state = uber_graph.invoke(state)

        origin_type = final_state.get("origin_type", "airport")
        reasoning = final_state.get("reasoning", "")
        suggested_message = final_state.get("suggested_message", "")
        uber_app_url = final_state.get("uber_app_url")
        deep_link_url = final_state.get("deep_link_url")
        pickup_label = final_state.get("pickup_label")
        dropoff_label = final_state.get("dropoff_label")
        airport_options = final_state.get("airport_options", [])
        alternative_options = final_state.get("alternative_options", [])
        logger.info(
            "uber agent graph complete | run_id=%s | origin_type=%s | has_deeplink=%s | airport_options=%d | alternatives=%d",
            ctx.run_id,
            origin_type,
            bool(uber_app_url or deep_link_url),
            len(airport_options),
            len(alternative_options),
        )

        # Always build and emit the recommendation card
        card = UberRideSuggestionCard(
            origin_type=origin_type,
            reasoning=reasoning,
            suggested_message=suggested_message,
            pickup_label=pickup_label,
            dropoff_label=dropoff_label,
            uber_app_url=uber_app_url,
            deep_link_url=deep_link_url,
            airport_options=airport_options,
            alternative_options=alternative_options,
        ).model_dump()

        logger.info(
            "uber agent emitting recommendation | run_id=%s | pickup_label=%r | dropoff_label=%r",
            ctx.run_id,
            pickup_label,
            dropoff_label,
        )
        ctx.emit(build_recommendation_ready(card))
        ctx.emit(build_done("ok_no_action"))

        return AgentResult(
            agent=self.manifest.name,
            version=self.manifest.version,
            status="ok",
            summary=suggested_message,
            cards=[card],
            # No proposed_actions — deep link requires no server-side commit action.
            proposed_actions=[],
            raw=final_state,
        )


AGENT = UberAgent()
