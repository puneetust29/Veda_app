from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.agents.roaming.graph import subscribe_graph
from app.db.client import get_supabase
from app.deps import get_current_customer
from app.orchestration.intents import Intent, OrchestratorRequest
from app.orchestration.orchestrator import get_orchestrator
from app.orchestration.registry import get_registry
from app.policy import risk as policy
from app.routers._shared import get_owned_calendar_event

router = APIRouter(prefix="/roaming", tags=["roaming"])

NO_PLAN_DETAIL = "No suitable roaming plan could be recommended for this trip"


class RecommendRequest(BaseModel):
    calendar_event_id: str


class RecommendResponse(BaseModel):
    calendar_event_id: str
    destination_country: str
    trip_duration_days: int
    candidate_plan: Optional[dict]
    reasoning: str
    judge_approved: bool
    judge_feedback: str


class SubscribeRequest(BaseModel):
    calendar_event_id: str
    roaming_plan_id: str
    reasoning: str
    judge_feedback: str


@router.get("/plans")
def list_plans() -> list[dict]:
    supabase = get_supabase()
    return supabase.table("roaming_plans").select("*").execute().data


@router.post("/recommend", response_model=RecommendResponse)
def recommend(body: RecommendRequest, customer: dict = Depends(get_current_customer)):
    event = get_owned_calendar_event(body.calendar_event_id, customer["id"])

    orchestrator = get_orchestrator()
    orchestrator_request = OrchestratorRequest(
        principal=customer,
        subject={"calendar_event": event},
        intent=Intent(),
        mode="suggest",
    )
    outcome = orchestrator.run(orchestrator_request)

    if not outcome.results:
        # No agent matched this event (e.g. its manifest's trigger rules don't apply) --
        # from the caller's perspective this is indistinguishable from "found no plan".
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=NO_PLAN_DETAIL)

    result = outcome.results[0]

    if result.status == "failed" and result.error != "no_plan_found":
        # The orchestrator's Dispatch step wraps every agent.execute() in try/except so
        # one agent's crash never aborts a multi-agent run -- but for this single-agent
        # legacy route, a genuine execution failure (LLM/Supabase error, etc.) should
        # still surface as a server error, exactly as an uncaught exception did before
        # this route was re-pointed at the orchestrator, rather than a misleading 422.
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result.error)

    final_state = result.raw

    if final_state.get("is_home_country"):
        return RecommendResponse(
            calendar_event_id=event["id"],
            destination_country=final_state["destination_country"],
            trip_duration_days=final_state["trip_duration_days"],
            candidate_plan=None,
            reasoning=result.summary,
            judge_approved=False,
            judge_feedback="",
        )

    if not final_state.get("candidate_plan"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=NO_PLAN_DETAIL)

    return RecommendResponse(
        calendar_event_id=event["id"],
        destination_country=final_state["destination_country"],
        trip_duration_days=final_state["trip_duration_days"],
        candidate_plan=final_state["candidate_plan"],
        reasoning=final_state["reasoning"],
        judge_approved=final_state.get("judge_approved", False),
        judge_feedback=final_state.get("judge_feedback", ""),
    )


@router.post("/subscribe")
def subscribe(body: SubscribeRequest, customer: dict = Depends(get_current_customer)) -> dict:
    event = get_owned_calendar_event(body.calendar_event_id, customer["id"])

    supabase = get_supabase()
    plan_row = (
        supabase.table("roaming_plans")
        .select("price")
        .eq("id", body.roaming_plan_id)
        .limit(1)
        .execute()
    )
    params = {"price": plan_row.data[0]["price"]} if plan_row.data else {}

    manifest = get_registry().get("roaming_agent").manifest
    decision = policy.evaluate(
        manifest,
        "activate_roaming_plan",
        params,
        principal=customer,
        approved=True,
    )
    if not decision.allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=decision.reason or "Not allowed")

    final_state = subscribe_graph.invoke(
        {
            "customer": customer,
            "calendar_event": event,
            "candidate_plan": {"id": body.roaming_plan_id},
            "reasoning": body.reasoning,
            "judge_feedback": body.judge_feedback,
        }
    )
    return final_state["subscription_result"]
