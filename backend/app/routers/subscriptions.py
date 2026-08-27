from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.db.client import get_supabase
from app.deps import get_current_customer

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.get("")
def list_subscriptions(customer: dict = Depends(get_current_customer)) -> list[dict]:
    supabase = get_supabase()
    result = (
        supabase.table("subscriptions")
        .select("*, roaming_plans(*), calendar_events(*)")
        .eq("customer_id", customer["id"])
        .order("subscribed_at", desc=True)
        .execute()
    )
    return result.data


class UserSelectionsInput(BaseModel):
    roaming_plan_id: int | None = None
    travel_insurance_plan_id: int | None = None


@router.post("/selections")
def save_user_selections(
    body: UserSelectionsInput,
    customer: dict = Depends(get_current_customer),
) -> dict:
    """Save user's selected roaming and travel insurance plans from chat.

    Called when user approves roaming or travel insurance in the chat workflow.
    Stores selections so they can be shown with checkmarks on next login.
    """
    supabase = get_supabase()
    result = (
        supabase.table("user_selections")
        .upsert({
            "customer_id": customer["id"],
            "roaming_plan_id": body.roaming_plan_id,
            "travel_insurance_plan_id": body.travel_insurance_plan_id,
        })
        .execute()
    )
    return result.data[0] if result.data else {}


@router.get("/selections")
def get_user_selections(customer: dict = Depends(get_current_customer)) -> dict | None:
    """Get user's previously selected plans.

    Returns stored roaming and travel insurance selections to display checkmarks
    on recommendation cards. Called on dashboard load.
    """
    supabase = get_supabase()
    result = (
        supabase.table("user_selections")
        .select("*")
        .eq("customer_id", customer["id"])
        .execute()
    )
    return result.data[0] if result.data else None
