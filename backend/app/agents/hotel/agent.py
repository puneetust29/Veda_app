"""Hotel booking detection agent."""
import pathlib
from datetime import datetime

from app.agents.base.contracts import BaseAgent, AgentContext, AgentResult, AgentMode
from app.agents.base.manifest import load_manifest
from app.db.client import get_supabase
from .hotel_detector import detect_hotel_for_flight, get_sample_hotels
from .schemas import HotelDetectionResult, HotelBooking

_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"


class HotelAgent(BaseAgent):
    """Agent that detects hotel bookings for a flight and suggests hotels if none found."""

    def __init__(self) -> None:
        self.manifest = load_manifest(_MANIFEST_PATH)

    def execute(self, ctx: AgentContext, mode: AgentMode) -> AgentResult:
        """Execute hotel detection for a flight."""
        try:
            # Extract flight details from context
            flight = ctx.context.get("calendar_event")
            customer = ctx.context.get("customer")

            if not flight or not customer:
                ctx.emit({
                    "type": "error",
                    "data": {"code": "incomplete_context", "retryable": False}
                })
                ctx.emit({"type": "done", "data": {"status": "failed"}})
                return AgentResult(
                    agent="hotel_agent",
                    version="0.1.0",
                    status="error",
                    summary="Missing flight or customer context",
                    raw={"error": "incomplete_context"},
                )

            customer_id = customer.get("id")
            destination = flight.get("destination")
            arrival_date_str = flight.get("start_datetime")

            if not destination or not arrival_date_str:
                ctx.emit({"type": "text", "data": {"role": "agent", "text": "Unable to check hotels without destination information."}})
                ctx.emit({"type": "done", "data": {"status": "ok"}})
                return AgentResult(
                    agent="hotel_agent",
                    version="0.1.0",
                    status="success",
                    summary="No destination information available",
                    raw={
                        "hotel": None,
                        "suggestion": "Unable to check hotels without destination information.",
                    },
                )

            # Parse arrival date
            try:
                arrival_date = datetime.fromisoformat(arrival_date_str)
            except (ValueError, TypeError):
                arrival_date = datetime.now()

            # Detect hotel booking
            hotel = detect_hotel_for_flight(customer_id, destination, arrival_date)

            # Prepare result
            if hotel and hotel.found:
                suggestion = f"Great! I found a hotel booking at {hotel.hotel_name} in {hotel.location}. Check-in: {hotel.check_in}"
                result_data = {
                    "hotel": hotel.model_dump(),
                    "suggestion": suggestion,
                    "recommendations": None,
                }
            else:
                # Get sample hotel recommendations
                recommendations = get_sample_hotels(destination, count=3)
                suggestion = f"No hotel booking found for your trip to {destination}. Would you like me to suggest some great hotels for your stay?"
                result_data = {
                    "hotel": hotel.model_dump() if hotel else None,
                    "suggestion": suggestion,
                    "recommendations": recommendations,
                }

            result = HotelDetectionResult(**result_data)

            # Emit hotel result event for the frontend
            ctx.emit({
                "type": "hotel_result",
                "data": result.model_dump()
            })
            ctx.emit({"type": "done", "data": {"status": "ok"}})

            return AgentResult(
                agent="hotel_agent",
                version="0.1.0",
                status="success",
                summary=result.suggestion,
                raw=result.model_dump(),
            )

        except Exception as e:
            import sys

            print(f"[ERROR] Hotel agent error: {e}", file=sys.stderr)
            ctx.emit({
                "type": "error",
                "data": {"code": "hotel_agent_error", "retryable": False, "message": str(e)}
            })
            ctx.emit({"type": "done", "data": {"status": "failed"}})
            return AgentResult(
                agent="hotel_agent",
                version="0.1.0",
                status="error",
                summary=f"Error detecting hotel: {str(e)}",
                raw={"error": str(e)},
            )

    async def execute_action(self, ctx: AgentContext, action: str) -> AgentResult:
        """Execute an action (not used in Phase 1)."""
        return AgentResult(
            agent="hotel_agent",
            version="0.1.0",
            status="error",
            summary="Actions not yet implemented",
            raw={"error": "not_implemented"},
        )


# Export instance for registry discovery
AGENT = HotelAgent()
