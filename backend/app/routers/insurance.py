"""Travel insurance plans and content."""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import List, Optional
import logging

from app.integrations.strapi import StrapiClient, TravelInsurancePlan
from app.deps import get_current_customer
from app.routers._shared import get_owned_calendar_event
from app.orchestration.intents import Intent, OrchestratorRequest
from app.orchestration.orchestrator import get_orchestrator

logger = logging.getLogger(__name__)
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


@router.get("/plans/recommend")
def recommend_insurance_plan(
    calendar_event_id: str,
    customer: dict = Depends(get_current_customer),
) -> Optional[dict]:
    """Get a travel insurance recommendation for a calendar event using the insurance agent."""
    logger.info(f"[insurance/recommend] START: calendar_event_id={calendar_event_id}")
    logger.info(f"[insurance/recommend] customer_id={customer.get('id') if customer else 'NONE'}")

    try:
        logger.info(f"[insurance/recommend] fetching calendar event...")
        event = get_owned_calendar_event(calendar_event_id, customer["id"])
        logger.info(f"[insurance/recommend] event: destination={event.get('destination')}, start={event.get('start_datetime')}")

        logger.info(f"[insurance/recommend] building orchestrator request...")
        request = OrchestratorRequest(
            principal=customer,
            subject={"calendar_event": event, "trigger_travel_insurance": True},
            intent=Intent(capability="travel_insurance"),
            conversation_id=calendar_event_id,
            mode="suggest",
        )

        logger.info(f"[insurance/recommend] running orchestrator...")
        result = get_orchestrator().run(request)
        logger.info(f"[insurance/recommend] orchestrator returned {len(result.results)} results")

        # Extract the recommended plan from the agent's result
        if result.results and len(result.results) > 0:
            agent_result = result.results[0]
            logger.info(f"[insurance/recommend] agent_result status={agent_result.status}, cards={len(agent_result.cards)}")
            if agent_result.cards and len(agent_result.cards) > 0:
                card = agent_result.cards[0]
                plan = card.get("plan")
                logger.info(f"[insurance/recommend] SUCCESS: returning plan {plan.get('planName') if plan else 'NONE'}")
                return plan

        logger.warning(f"[insurance/recommend] no plan in result")
        return None
    except HTTPException as e:
        logger.exception(f"[insurance/recommend] HTTPException: {e.detail}")
        raise
    except Exception as e:
        logger.exception(f"[insurance/recommend] Exception: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to recommend insurance plan: {str(e)}",
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
