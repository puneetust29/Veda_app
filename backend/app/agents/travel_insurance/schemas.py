"""Schemas for travel insurance agent."""
from typing import Literal
from pydantic import BaseModel


class PlanRecommendation(BaseModel):
    plan_id: int
    reasoning: str


class TravelInsuranceRecommendationCard(BaseModel):
    kind: Literal["travel_insurance_plan"] = "travel_insurance_plan"
    plan: dict
    reasoning: str
