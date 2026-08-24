"""Pydantic schemas for hotel detection agent."""
from typing import Optional, Literal
from pydantic import BaseModel, Field


class HotelBooking(BaseModel):
    """A detected hotel booking or suggestions."""

    found: bool = Field(description="Whether a hotel booking was found")
    hotel_name: Optional[str] = Field(None, description="Name of the hotel")
    check_in: Optional[str] = Field(None, description="Check-in date (ISO format)")
    check_out: Optional[str] = Field(None, description="Check-out date (ISO format)")
    location: Optional[str] = Field(None, description="Hotel location/city")
    source: Optional[Literal["calendar", "email"]] = Field(None, description="Where the booking was detected")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="Confidence score 0-1")
    suggestion: Optional[str] = Field(None, description="Suggestion message for the user")
    recommendations: Optional[list[dict]] = Field(None, description="Sample hotel recommendations if no booking found")


class HotelDetectionResult(BaseModel):
    """Result of hotel detection for a flight."""

    hotel: Optional[HotelBooking] = Field(None, description="Detected hotel booking if found")
    suggestion: str = Field(description="Suggestion message for the user")
    recommendations: Optional[list[dict]] = Field(None, description="Sample hotel recommendations if no booking found")
