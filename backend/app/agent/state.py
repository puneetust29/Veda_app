from typing import Optional, TypedDict


class RoamingAgentState(TypedDict, total=False):
    customer: dict
    calendar_event: dict

    destination_country: str
    trip_duration_days: int

    roaming_catalog: list[dict]

    candidate_plan: Optional[dict]
    reasoning: str

    judge_approved: bool
    judge_feedback: str
    retry_count: int

    subscription_result: Optional[dict]
