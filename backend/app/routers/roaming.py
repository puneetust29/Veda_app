from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.agent.graph import recommend_graph, subscribe_graph
from app.db.client import get_supabase
from app.deps import get_current_customer

router = APIRouter(prefix="/roaming", tags=["roaming"])


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


def _get_owned_event(event_id: str, customer_id: str) -> dict:
    supabase = get_supabase()
    result = (
        supabase.table("calendar_events")
        .select("*")
        .eq("id", event_id)
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return result.data[0]


@router.get("/plans")
def list_plans() -> list[dict]:
    supabase = get_supabase()
    return supabase.table("roaming_plans").select("*").execute().data


@router.post("/recommend", response_model=RecommendResponse)
def recommend(body: RecommendRequest, customer: dict = Depends(get_current_customer)):
    event = _get_owned_event(body.calendar_event_id, customer["id"])

    final_state = recommend_graph.invoke({"customer": customer, "calendar_event": event})

    if not final_state.get("candidate_plan"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No suitable roaming plan could be recommended for this trip",
        )

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
    event = _get_owned_event(body.calendar_event_id, customer["id"])

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
