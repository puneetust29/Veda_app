def veda_prompt(
    user_message: str,
    history: list[dict] = None,
    location_context: str = None,
    enriched_location_context: dict = None,
) -> str:
    """Build the Veda system + user prompt.

    Accepts either a plain string context (legacy) or an enriched structured
    context dict. The enriched form produces a richer, more actionable prompt.
    """
    history_lines = ""
    if history:
        history_lines = "\nRecent conversation history:\n"
        for msg in history[-4:]:  # last 4 turns for context
            role = "Customer" if msg.get("role") == "user" else "Veda"
            history_lines += f"{role}: {msg.get('text', '')}\n"
    location_section = _build_location_section(location_context, enriched_location_context)

    return (
        "You are Veda, the travel assistant inside the Veda app. Your role is to help customers "
        "with questions about the Veda app's features (roaming plans, subscriptions, calendar/Gmail sync) "
        "or their travel plans.\n\n"
        "Guidelines:\n"
        "- Answer questions about roaming plans, travel insurance, flight bookings, and trip planning\n"
        "- Answer questions about Veda app features: how to connect calendars, Gmail, manage subscriptions\n"
        "- If the customer's message asks you to tell/notify/message someone, "
        "draft a short, friendly message in share_text and mention in reply that you've prepared it\n"
        "- Location management (disable tracking, pause geofencing, list/delete locations, "
        "create temporary geofence): set location_action with the appropriate kind and confirm in reply\n"
        "- Nearby place search ('find me a grocery store', 'nearest pharmacy', 'coffee shop nearby', etc.): "
        "set location_action.kind = 'search_nearby_places' and location_action.category to the right value. "
        "Reply with something like 'Searching for pharmacies near you…'. "
        "Valid categories: grocery, pharmacy, hospital, urgent_care, gas_station, coffee_shop, "
        "restaurant, atm, bank, ev_charger, park, shopping, transit, airport\n"
        "- If the customer names a SPECIFIC store or brand ('Trader Joe\\'s', 'CVS', 'McDonald\\'s', 'Walgreens', etc.): "
        "also set location_action.keyword to that name. Still set category to the matching type (grocery, pharmacy, restaurant, etc.).\n"
        "- If the customer specifies a DISTANCE ('within 5 miles', '10 mile radius', '2 km away', etc.): "
        "set location_action.radius_miles to that number (convert km to miles: 1 km = 0.621 miles). "
        "Default radius is 1 mile when no distance is mentioned.\n"
        "- If customer wants open places only ('open now', 'currently open'): "
        "also set location_action.open_now = true\n"
        "- 'Where am I?' / 'What's my location?' → answer directly from location context; "
        "do NOT set a location_action\n"
        "- Navigation or directions ('take me there', 'get directions'): "
        "set location_action.kind = 'request_navigation'\n"
        "- Save a place ('save this as my grocery store', 'add this to favorites'): "
        "set location_action.kind = 'save_favorite_place' with place_label\n"
        "- If the message is off-topic, set on_topic=false and reply with a brief redirect\n"
        "- Always be concise, friendly, and helpful. Never mention raw GPS coordinates.\n"
        f"{location_section}"
        f"{history_lines}"
        f"\nCustomer's message: {user_message}"
    )

def _build_location_section(
    location_context: str | None,
    enriched: dict | None,
) -> str:
    if enriched:
        return _format_enriched_context(enriched)
    if location_context:
        return (
            "\nLocation & routine context (always use this; never say you lack location access):\n"
            f"{location_context}\n"
            "\nRules for location questions:\n"
            "- 'where am I?' → answer directly from context above\n"
            "- If context says 'currently at X' → 'You're at X'\n"
            "- If context says 'recently left X' → tell them when they left\n"
            "- If context says 'not within any saved location' → say location is on but not in a saved spot\n"
            "- If context says 'no saved locations' → explain how to add one\n"
            "- If context says 'disabled' → say location is off and how to enable it\n"
            "- Never mention raw GPS coordinates or lat/lng numbers\n"
        )
    return (
        "\nLocation context: not provided. If the customer asks about their location, "
        "tell them to check that 'Enable Location' is turned on in the Location & Geofences screen.\n"
    )


def _format_enriched_context(ctx: dict) -> str:
    mode = ctx.get("locationMode", "unknown")
    confidence = ctx.get("locationConfidence", "unknown")

    lines = ["\n== Location & Place Intelligence =="]
    lines.append(f"Mode: {mode} | Confidence: {confidence}")

    cp = ctx.get("currentPlace")
    if cp:
        label = cp.get("semanticLabel", "Unknown")
        category = cp.get("placeCategory", "")
        arrived_at = cp.get("arrivedAt")
        mins_str = ""
        if arrived_at:
            try:
                from datetime import datetime, timezone
                dt = datetime.fromisoformat(arrived_at.replace("Z", "+00:00"))
                mins = int((datetime.now(timezone.utc) - dt).total_seconds() / 60)
                mins_str = f" (arrived {mins} min ago)"
            except Exception:
                pass
        cat_str = f" [{category}]" if category else ""
        lines.append(f"Current place: {label}{cat_str}{mins_str}")
    else:
        transition = ctx.get("recentTransition")
        if transition:
            kind = transition.get("kind", "")
            place = transition.get("place", "")
            mins_ago = transition.get("minutesAgo", "?")
            lines.append(f"Recent transition: {kind} {place} ({mins_ago} min ago)")
        else:
            lines.append("Current place: not in a known location")

    nearby = ctx.get("nearbyPlaces", [])
    if nearby:
        lines.append("Nearby places:")
        for p in nearby[:5]:
            name = p.get("name", "")
            cat = p.get("category", "")
            dist = p.get("distanceMetres")
            open_str = ""
            is_open = p.get("isOpen")
            if is_open is True:
                open_str = ", open"
            elif is_open is False:
                open_str = ", closed"
            dist_str = f" ({dist}m away)" if dist else ""
            lines.append(f"  - {name} [{cat}]{dist_str}{open_str}")

    saved = ctx.get("savedPlaces", [])
    if saved:
        favorites = [p for p in saved if p.get("isFavorite")]
        if favorites:
            lines.append("Saved favorites: " + ", ".join(p.get("label", "") for p in favorites[:3]))

    routine = ctx.get("routineSummary")
    if routine:
        lines.append(f"Routine: {routine}")

    lines.append(
        "\nRules: answer 'where am I?' directly from Current place above. "
        "Never say raw coordinates. For nearby searches, set location_action. "
        "For 'where am I?', do NOT set location_action — just answer.\n"
    )
    return "\n".join(lines)
