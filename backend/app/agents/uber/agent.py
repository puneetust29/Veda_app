"""UberAgent: suggests an Uber ride for an upcoming flight and hands off via deep link.

Mirrors the RoamingAgent contract exactly:
  - Implements BaseAgent (execute / execute_action)
  - Exposes a module-level AGENT singleton for AgentRegistry.discover()
  - Loads manifest.yaml from the same directory
  - Emits the same stream event types (status, tool_started, tool_completed,
    recommendation_ready, error, done)

Current capability (Phase A2 per uber-backend-plan.md):
  Deep-link handoff only — no in-app booking, no price data.
  The uber:// and m.uber.com/ul/ URLs are the ONLY verified-working Uber
  integration path right now (Uber API scope approval is still pending).
  This is intentional and documented in tools/uber_deeplink.py.

No actions are declared (actions: []) because deep links require no commit-risk
server-side action — the user taps in their own Uber app. execute_action() is
intentionally not overridden; BaseAgent raises UnsupportedActionError if called.
"""
from __future__ import annotations

import asyncio
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
        }
        return state

    def execute(self, ctx: AgentContext, mode: AgentMode = "suggest") -> AgentResult:
        state = self._initial_state(ctx)

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

        should_suggest = final_state.get("should_suggest", False)
        reasoning = final_state.get("reasoning", "")
        suggested_message = final_state.get("suggested_message", "")
        uber_app_url = final_state.get("uber_app_url")
        deep_link_url = final_state.get("deep_link_url")
        origin_label = final_state.get("origin_label")
        destination_label = final_state.get("destination_label")

        if not should_suggest:
            ctx.emit(build_error("no_ride_suggested", retryable=False))
            ctx.emit(build_done("ok_no_action"))
            return AgentResult(
                agent=self.manifest.name,
                version=self.manifest.version,
                status="ok",
                summary=reasoning,
            )

        # Build and emit the recommendation card
        card = UberRideSuggestionCard(
            should_suggest=should_suggest,
            reasoning=reasoning,
            suggested_message=suggested_message,
            pickup_label=origin_label,
            dropoff_label=destination_label,
            uber_app_url=uber_app_url,
            deep_link_url=deep_link_url,
        ).model_dump()

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
