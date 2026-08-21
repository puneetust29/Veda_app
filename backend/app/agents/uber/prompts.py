"""Prompt strings for the Uber agent's LLM node, kept separate from graph.py
so the graph module stays focused on topology and control-flow."""


def suggest_ride_prompt(
    origin_label: str,
    destination_label: str,
    trip_duration_days: int,
    destination_country: str,
) -> str:
    """Prompt for Claude to decide whether to suggest an Uber ride for this trip.

    Current capability: deep-link handoff only (no in-app booking or price data —
    Uber API access is pending approval). The agent recommends based on context
    (flight detected, airport-to-airport transfer), then hands off via deep link.
    """
    return (
        "You are Veda, an AI travel companion for Vodafone customers. "
        "A customer has a flight coming up and you need to decide whether to suggest "
        "an Uber ride to help them get to or from the airport.\n\n"
        f"Flight details:\n"
        f"  Departure airport: {origin_label or 'unknown'}\n"
        f"  Arrival airport:   {destination_label or 'unknown'}\n"
        f"  Destination:       {destination_country}\n"
        f"  Trip duration:     {trip_duration_days} day(s)\n\n"
        "Decide whether to suggest an Uber ride. Set should_suggest=true if:\n"
        "  - The customer is departing from a known airport (origin_label is not 'unknown')\n"
        "  - An airport transfer makes sense for the journey\n\n"
        "Set should_suggest=false if the origin is unclear or an Uber doesn't fit.\n\n"
        "If suggesting, write a short, friendly suggested_message "
        "(e.g. 'Need a ride to Heathrow before your Tokyo flight?'). "
        "If not suggesting, still fill suggested_message with a brief explanation.\n\n"
        "Important: We can only open the Uber app with pickup and dropoff pre-filled — "
        "we cannot show live prices or book in-app right now. Keep messaging honest and "
        "focus on the convenience of having pickup/dropoff already set."
    )
