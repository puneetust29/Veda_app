"""Pydantic models for the Location Intelligence Platform."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

PlaceCategory = Literal[
    "home", "work", "frequent",
    "grocery", "pharmacy", "hospital", "urgent_care",
    "gas_station", "coffee_shop", "restaurant", "atm",
    "bank", "ev_charger", "park", "shopping",
    "transit", "airport", "unknown",
]

CATEGORY_TO_GOOGLE_TYPE: dict[str, list[str]] = {
    "grocery": ["grocery_store", "supermarket"],
    "pharmacy": ["pharmacy", "drugstore"],
    "hospital": ["hospital", "emergency_room"],
    "urgent_care": ["urgent_care", "medical_lab"],
    "gas_station": ["gas_station"],
    "coffee_shop": ["coffee_shop", "cafe"],
    "restaurant": ["restaurant"],
    "atm": ["atm"],
    "bank": ["bank"],
    "ev_charger": ["electric_vehicle_charging_station"],
    "park": ["park"],
    "shopping": ["shopping_mall", "department_store"],
    "transit": ["train_station", "subway_station", "bus_station", "transit_station"],
    "airport": ["airport"],
}


class NearbySearchRequest(BaseModel):
    latitude: float = Field(description="User latitude")
    longitude: float = Field(description="User longitude")
    category: PlaceCategory = Field(default="unknown", description="Place category for labelling results")
    keyword: Optional[str] = Field(
        default=None,
        description="Specific store name or brand (e.g. 'Trader Joe\\'s'). When set, uses text search instead of category search.",
    )
    radius_metres: int = Field(default=1000, ge=100, le=50000)
    open_now: bool = Field(default=False)
    max_results: int = Field(default=5, ge=1, le=10)


class NearbyPlaceResult(BaseModel):
    place_id: str
    name: str
    address: str
    distance_metres: Optional[float] = None
    is_open: Optional[bool] = None
    rating: Optional[float] = None
    category: PlaceCategory


class NearbySearchResponse(BaseModel):
    places: list[NearbyPlaceResult]
    searched_at: str
    cache_hit: bool = False


class SavedPlaceRequest(BaseModel):
    label: str = Field(max_length=100)
    category: PlaceCategory
    place_id: Optional[str] = None
    geofence_id: Optional[str] = None
    is_favorite: bool = False


class SavedPlaceResponse(BaseModel):
    id: str
    customer_id: str
    label: str
    category: PlaceCategory
    place_id: Optional[str] = None
    geofence_id: Optional[str] = None
    is_favorite: bool
    added_at: str
