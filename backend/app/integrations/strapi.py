"""Travel insurance plan content loader (reads from local JSON file)."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import json
from pathlib import Path


class TravelInsurancePlan(BaseModel):
    id: int
    provider: str
    planName: str
    planType: str
    country: Optional[str] = None
    coverageDurationDays: Optional[int] = None
    coverageStart: str
    coverageEnd: str
    premiumAmount: float
    currency: str
    currencyCode: str
    whyThisOne: List[str]
    benefitsSummary: str
    fullCoverageDetails: Dict[str, List[str]]
    stripeAmountCents: int


class StrapiClient:
    """Loads travel insurance plans from local JSON file (dummy data for now)."""

    def __init__(self, base_url: str = None, api_token: str = None):
        """Initialize client. base_url and api_token are unused (for compatibility)."""
        # Load plans from JSON file once at initialization
        plans_file = Path(__file__).parent.parent / "data" / "travel_insurance_plans.json"
        with open(plans_file) as f:
            data = json.load(f)
        self._plans = {plan["id"]: TravelInsurancePlan(**plan) for plan in data}

    def get_travel_insurance_plans(self, country: Optional[str] = None) -> List[TravelInsurancePlan]:
        """Return travel insurance plans, optionally filtered by country (case-insensitive)."""
        plans = list(self._plans.values())
        if country:
            country_lower = country.strip().lower()
            plans = [p for p in plans if p.country and p.country.lower() == country_lower]
        return plans

    def get_travel_insurance_plan(self, plan_id: int) -> Optional[TravelInsurancePlan]:
        """Fetch a single plan by ID."""
        return self._plans.get(plan_id)

    def close(self):
        """No-op for compatibility."""
        pass
