"""Prompt strings for the Uber agent's LLM node."""


def suggest_ride_prompt(
    origin_label: str,
    destination_label: str,
    trip_duration_days: int,
    destination_country: str,
) -> str:
    """Prompt for the LLM to classify the origin type and write the user-facing message.

    The agent always suggests a ride — the LLM's job is to identify what kind of
    departure location this is and write an appropriate message for it.
    """
    return (
        "You are Veda, an AI travel companion. A customer has an upcoming trip and "
        "you need to classify the departure location and write a short friendly message "
        "suggesting an Uber ride.\n\n"
        f"Trip details:\n"
        f"  Departure location: {origin_label or 'unknown'}\n"
        f"  Arrival location:   {destination_label or 'unknown'}\n"
        f"  Destination:       {destination_country}\n"
        f"  Trip duration:     {trip_duration_days} day(s)\n\n"
        "Classify the departure location:\n"
        "  airport       — a commercial airport (e.g. 'London Heathrow (LHR)', 'Seattle-Tacoma International Airport (SEA)')\n"
        "  train_station — a railway or Eurostar station (e.g. 'London St Pancras', 'Paris Gare du Nord')\n"
        "  ferry         — a ferry terminal or port\n"
        "  unknown       — origin is missing, vague, or doesn't fit the above\n\n"
        "Then write a short, friendly suggested_message:\n"
        "  airport:       'Need a ride to Heathrow before your Tokyo flight?'\n"
        "  train_station: 'Need a ride to St Pancras for your Eurostar to Paris?'\n"
        "  ferry:         'Need a ride to the ferry terminal?'\n"
        "  unknown:       'Need an Uber before your trip? We can open the app with your current location.'\n\n"
        "Keep the message under 15 words. Be specific — use the actual station or airport name."
    )
