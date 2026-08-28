from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class LatLng(BaseModel):
    lat: float
    lng: float


class RouteOption(BaseModel):
    mode: str  # "DRIVE" | "TRANSIT" | "WALK"
    duration_mins: int
    distance_km: Optional[float] = None
    encoded_polyline: Optional[str] = None


class NearbyPlace(BaseModel):
    name: str
    category: str  # "hotel" | "restaurant" | "attraction"
    rating: Optional[float] = None
    address: Optional[str] = None


class MapsResult(BaseModel):
    origin: str
    destination: str
    origin_latlng: Optional[LatLng] = None
    destination_latlng: Optional[LatLng] = None
    # Legacy single-route fields (kept for backward compat)
    distance_km: Optional[float] = None
    duration_mins: Optional[int] = None
    encoded_polyline: Optional[str] = None
    summary: str = ""
    geocode_ok: bool = False
    route_ok: bool = False
    # Multi-mode routes
    routes: list[RouteOption] = Field(default_factory=list)
    # Nearby places at destination
    nearby_places: list[NearbyPlace] = Field(default_factory=list)
