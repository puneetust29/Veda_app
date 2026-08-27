from fastapi import APIRouter, Depends

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
