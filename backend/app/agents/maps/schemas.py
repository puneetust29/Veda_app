from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class LatLng(BaseModel):
    lat: float
    lng: float


class RouteStep(BaseModel):
    instruction: str
    distance_m: int
    duration_secs: int


class MapsResult(BaseModel):
    origin: str
    destination: str
    origin_latlng: Optional[LatLng] = None
    destination_latlng: Optional[LatLng] = None
    distance_km: Optional[float] = None
    duration_mins: Optional[int] = None
    encoded_polyline: Optional[str] = None
    summary: str = ""
    geocode_ok: bool = False
    route_ok: bool = False
