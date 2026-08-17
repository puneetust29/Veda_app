from fastapi import APIRouter, Depends, HTTPException, status

from app.db.client import get_supabase
from app.deps import get_current_customer

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/events")
def list_events(customer: dict = Depends(get_current_customer)) -> list[dict]:
    supabase = get_supabase()
    result = (
        supabase.table("calendar_events")
        .select("*")
        .eq("customer_id", customer["id"])
        .order("start_datetime")
        .execute()
    )
    return result.data


@router.get("/events/{event_id}")
def get_event(event_id: str, customer: dict = Depends(get_current_customer)) -> dict:
    supabase = get_supabase()
    result = (
        supabase.table("calendar_events")
        .select("*")
        .eq("id", event_id)
        .eq("customer_id", customer["id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return result.data[0]
