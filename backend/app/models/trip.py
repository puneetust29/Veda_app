"""Round-trip flight models."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class FlightLeg(BaseModel):
    """A single flight leg (outbound or return)."""
    flight_id: str
    city: str
    airport_code: str
    date: datetime


class RoundTrip(BaseModel):
    """Grouped round-trip flight."""
    trip_id: str
    outbound_flight: FlightLeg
    return_flight: Optional[FlightLeg] = None
    destination_country: str
    trip_duration_days: int
    is_round_trip: bool

    def to_calendar_display(self) -> dict:
        """Format for dashboard display."""
        if self.is_round_trip and self.return_flight:
            return {
                "trip_id": self.trip_id,
                "type": "round_trip",
                "title": f"{self.outbound_flight.city} → {self.return_flight.city}",
                "destination_country": self.destination_country,
                "departure_date": self.outbound_flight.date.isoformat(),
                "return_date": self.return_flight.date.isoformat(),
                "duration_days": self.trip_duration_days,
                "legs": [
                    {
                        "date": self.outbound_flight.date.isoformat(),
                        "from": self.outbound_flight.city,
                        "to": self.return_flight.city,
                    },
                    {
                        "date": self.return_flight.date.isoformat(),
                        "from": self.return_flight.city,
                        "to": self.outbound_flight.city,
                    }
                ]
            }
        else:
            return {
                "trip_id": self.trip_id,
                "type": "one_way",
                "title": f"{self.outbound_flight.city} → ?",
                "destination_country": self.destination_country,
                "departure_date": self.outbound_flight.date.isoformat(),
                "return_date": None,
                "duration_days": None,
                "legs": [{
                    "date": self.outbound_flight.date.isoformat(),
                    "from": self.outbound_flight.city,
                    "to": self.outbound_flight.city,
                }]
            }
