from fastapi import HTTPException, status

from app.db.client import get_supabase


def get_owned_calendar_event(event_id: str, customer_id: str) -> dict:
    """Fetch a calendar_events row, scoped to the requesting customer. Shared between
    routers/roaming.py and routers/conversation.py."""
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
