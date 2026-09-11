"""Geofence event ingestion endpoint.

Mobile clients POST a GeofenceEvent when the OS fires a region-crossing callback.
Events are stored in Supabase for AI agent consumption; no continuous GPS history
is stored here — only the crossing timestamp and the named geofence that fired.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.db.client import get_supabase
from app.deps import get_current_customer

router = APIRouter(prefix="/geofence", tags=["geofence"])


class GeofenceEventRequest(BaseModel):
    type: Literal["GEOFENCE_ENTER", "GEOFENCE_EXIT"]
    geofence_id: str
    geofence_label: str
    geofence_type: Literal["home", "work", "custom"]
    timestamp: str
    latitude: float
    longitude: float


@router.post("/event")
def report_geofence_event(
    body: GeofenceEventRequest,
    customer: dict = Depends(get_current_customer),
) -> dict:
    """Record a geofence enter/exit event from the mobile client."""
    supabase = get_supabase()
    result = (
        supabase.table("geofence_events")
        .insert(
            {
                "customer_id": customer["id"],
                "event_type": body.type,
                "geofence_id": body.geofence_id,
                "geofence_label": body.geofence_label,
                "geofence_type": body.geofence_type,
                "event_timestamp": body.timestamp,
                "latitude": body.latitude,
                "longitude": body.longitude,
                "recorded_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
    )
    row_id = result.data[0]["id"] if result.data else None
    return {"recorded": True, "id": row_id}


@router.get("/events")
def list_geofence_events(
    limit: int = 50,
    customer: dict = Depends(get_current_customer),
) -> list[dict]:
    """Return recent geofence events for this customer (useful for AI agent context)."""
    supabase = get_supabase()
    result = (
        supabase.table("geofence_events")
        .select("*")
        .eq("customer_id", customer["id"])
        .order("event_timestamp", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data
