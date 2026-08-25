"""TravelInsuranceAgent: recommends travel insurance plans matched to trip destination and duration."""
from __future__ import annotations

import pathlib
import uuid

from app.agents.base.contracts import AgentContext, AgentMode, AgentResult, BaseAgent
from app.agents.base.manifest import load_manifest
from app.agents.travel_insurance.graph import TravelInsuranceAgentState, recommend_graph
from app.agents.travel_insurance.schemas import TravelInsuranceRecommendationCard
from app.context.resolver import get_context_resolver

_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"


class TravelInsuranceAgent(BaseAgent):
    def __init__(self) -> None:
        self.manifest = load_manifest(_MANIFEST_PATH)

    def _initial_state(self, ctx: AgentContext) -> TravelInsuranceAgentState:
        customer = ctx.context.get("customer")
        calendar_event = ctx.context.get("calendar_event")
        state: TravelInsuranceAgentState = {
            "run_id": ctx.run_id,
            "customer_id": (customer or {}).get("id"),
            "conversation_id": ctx.conversation_id,
            "mode": ctx.mode,
            "context": ctx.context,
            "customer": customer,
            "calendar_event": calendar_event,
            "user_message": ctx.user_message,
        }
        return state

    def execute(self, ctx: AgentContext, mode: AgentMode = "suggest") -> AgentResult:
        state = self._initial_state(ctx)

        # Run the graph synchronously (recommend_graph.invoke)
        final_state = recommend_graph.invoke(state)

        candidate_plan = final_state.get("candidate_plan")
        reasoning = final_state.get("reasoning", "")

        cards = []
        proposed_actions = []

        if not candidate_plan:
            # No plan found in catalog
            ctx.emit({"type": "error", "data": {"code": "no_plan_found", "retryable": False}})
            ctx.emit({"type": "done", "data": {"status": "ok_no_action"}})
            return AgentResult(
                agent=self.manifest.name,
                version=self.manifest.version,
                status="failed",
                summary=reasoning,
                raw=final_state,
                error="no_plan_found",
            )

        # Emit recommendation with the card
        card = TravelInsuranceRecommendationCard(
            plan=candidate_plan,
            reasoning=reasoning,
        ).model_dump()
        cards.append(card)
        ctx.emit({"type": "recommendation_ready", "data": {"card": card}})

        # No confirmation_required event -- purchase goes through separate Stripe flow
        ctx.emit({"type": "done", "data": {"status": "ok_no_action"}})

        return AgentResult(
            agent=self.manifest.name,
            version=self.manifest.version,
            status="ok",
            summary=reasoning,
            cards=cards,
            proposed_actions=proposed_actions,
            raw=final_state,
        )

    def execute_action(self, ctx: AgentContext, action: str) -> AgentResult:
        # No commit-risk actions for insurance (purchase is handled by Stripe flow)
        return super().execute_action(ctx, action)


# Register the context resolver for trigger_travel_insurance
get_context_resolver().register(
    "trigger_travel_insurance",
    lambda principal, subject: bool((subject or {}).get("trigger_travel_insurance")),
)

AGENT = TravelInsuranceAgent()
