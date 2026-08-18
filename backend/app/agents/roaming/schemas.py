from typing import Literal

from pydantic import BaseModel, Field


class PlanRecommendation(BaseModel):
    plan_id: str = Field(description="id of the chosen roaming_plans row")
    reasoning: str = Field(description="why this plan fits the trip")


class JudgeVerdict(BaseModel):
    approved: bool
    feedback: str = Field(description="why approved, or what is wrong if rejected")


class RoamingRecommendationCard(BaseModel):
    """The `recommendation_ready` stream event's `card` payload shape -- a discriminated
    union member (`kind`) so a future agent's card type is an additive case, not a rewrite.
    """

    kind: Literal["roaming_plan"] = "roaming_plan"
    plan: dict
    reasoning: str
    judge_approved: bool
    judge_feedback: str
