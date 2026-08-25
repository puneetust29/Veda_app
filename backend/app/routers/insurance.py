"""Travel insurance plans and content."""
from fastapi import APIRouter, HTTPException, status
from typing import List

from app.integrations.strapi import StrapiClient, TravelInsurancePlan

router = APIRouter(prefix="/insurance", tags=["insurance"])

# Initialize the Strapi client (reads from local JSON file)
strapi = StrapiClient()


@router.get("/plans", response_model=List[TravelInsurancePlan])
def get_insurance_plans():
    """Fetch all available travel insurance plans."""
    try:
        plans = strapi.get_travel_insurance_plans()
        return plans
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch plans: {str(e)}",
        )


@router.get("/plans/{plan_id}", response_model=TravelInsurancePlan)
def get_insurance_plan(plan_id: int):
    """Fetch a single insurance plan by ID."""
    try:
        plan = strapi.get_travel_insurance_plan(plan_id)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
            )
        return plan
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch plan: {str(e)}",
        )
