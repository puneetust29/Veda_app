"""RoamingAgent: wraps the existing recommend/subscribe LangGraphs behind the generic
Agent contract.

execute() serves both the legacy blocking routes (mode="suggest" -> graph.invoke(),
unchanged from today) and the streaming chat endpoint (mode="converse" ->
graph.stream() pumped through agents.base.runner.run_graph_streaming so the graph's
blocking Anthropic/Supabase calls never run on the FastAPI event loop). The
recommendation_ready / confirmation_required / error / done events are emitted here,
once the graph has finished, regardless of mode -- ctx.emit is a no-op for the legacy
routes (see AgentContext's default), so this adds no behavior there.

execute_action() runs the subscribe step for the one commit-risk action this agent
declares (`activate_roaming_plan`).
"""
from __future__ import annotations

import asyncio
import pathlib
import uuid

from app.agents.base.contracts import AgentContext, AgentMode, AgentResult, BaseAgent
from app.agents.base.manifest import load_manifest
from app.agents.base.runner import run_graph_streaming
from app.agents.roaming.graph import recommend_graph, subscribe_graph
from app.agents.roaming.schemas import RoamingRecommendationCard
from app.agents.roaming.state import RoamingAgentState
from app.agents.roaming.stream_map import (
    build_confirmation_required,
    build_done,
    build_error,
    build_recommendation_ready,
    translate,
)

_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"


class RoamingAgent(BaseAgent):
    def __init__(self) -> None:
        self.manifest = load_manifest(_MANIFEST_PATH)

    def _initial_state(self, ctx: AgentContext) -> RoamingAgentState:
        customer = ctx.context.get("customer")
        calendar_event = ctx.context.get("calendar_event")
        state: RoamingAgentState = {
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

            # The graph's nodes are synchronous (blocking Anthropic + Supabase calls);
            # run_graph_streaming pumps them through asyncio.to_thread so they never
            # block the FastAPI event loop. We're normally already inside a worker
            # thread here (the router wraps the whole orchestrator.run() call in
            # asyncio.to_thread), so asyncio.run() opens a fresh loop scoped to this
            # thread purely to drive that awaitable to completion.
            final_state = asyncio.run(run_graph_streaming(recommend_graph, state, _forward_translated))
        else:
            final_state = recommend_graph.invoke(state)

        candidate_plan = final_state.get("candidate_plan")
        judge_approved = bool(final_state.get("judge_approved"))
        reasoning = final_state.get("reasoning", "")
        judge_feedback = final_state.get("judge_feedback", "")
        calendar_event = final_state.get("calendar_event") or {}

        cards = []
        proposed_actions = []

        if not candidate_plan:
            # No candidate at all (empty catalog / graph never found anything) -- this
            # mirrors today's 422 in the legacy /roaming/recommend route.
            ctx.emit(build_error("no_plan_found", retryable=False))
            ctx.emit(build_done("ok_no_action"))
            return AgentResult(
                agent=self.manifest.name,
                version=self.manifest.version,
                status="failed",
                summary=reasoning,
                raw=final_state,
                error="no_plan_found",
            )

        # Emit recommendation_ready regardless of judge_approved -- matches today's
        # behavior of returning judge_approved:false rather than erroring. Round-trip
        # through the manifest's declared output_schema so a malformed card fails loud
        # here rather than shipping a bad shape to the client.
        card = RoamingRecommendationCard(
            plan=candidate_plan,
            reasoning=reasoning,
            judge_approved=judge_approved,
            judge_feedback=judge_feedback,
        ).model_dump()
        cards.append(card)
        ctx.emit(build_recommendation_ready(card))

        if judge_approved:
            action_id = str(uuid.uuid4())
            ctx.emit(build_confirmation_required(action_id, candidate_plan, calendar_event))
            proposed_actions.append(
                {
                    "name": "activate_roaming_plan",
                    "params": {"price": candidate_plan.get("price")},
                    "action_id": action_id,
                    "plan_id": candidate_plan.get("id"),
                    "calendar_event_id": calendar_event.get("id"),
                }
            )
            status = "awaiting_approval"
            done_status = "awaiting_approval"
        else:
            status = "ok"
            done_status = "ok_no_action"

        ctx.emit(build_done(done_status))

        return AgentResult(
            agent=self.manifest.name,
            version=self.manifest.version,
            status=status,
            summary=reasoning,
            cards=cards,
            proposed_actions=proposed_actions,
            raw=final_state,
        )

    def execute_action(self, ctx: AgentContext, action: str) -> AgentResult:
        if action != "activate_roaming_plan":
            return super().execute_action(ctx, action)

        state = self._initial_state(ctx)
        state["candidate_plan"] = ctx.context.get("candidate_plan") or {"id": ctx.context.get("plan_id")}
        state["reasoning"] = ctx.context.get("reasoning", "")
        state["judge_feedback"] = ctx.context.get("judge_feedback", "")

        final_state = subscribe_graph.invoke(state)

        return AgentResult(
            agent=self.manifest.name,
            version=self.manifest.version,
            status="ok",
            raw=final_state,
        )


AGENT = RoamingAgent()
