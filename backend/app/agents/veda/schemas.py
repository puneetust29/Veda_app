from typing import Literal, Optional

from pydantic import BaseModel, Field


class LocationAction(BaseModel):
    kind: Literal[
        "disable_tracking",
        "pause_geofencing",
        "resume_geofencing",
        "list_locations",
        "delete_location",
        "create_temporary_geofence",
        "set_location_context",
        # Location Intelligence: search & discovery
        "search_nearby_places",
        "show_place_details",
        "save_favorite_place",
        "remove_favorite_place",
        "request_navigation",
        "show_shopping_list_prompt",
    ] = Field(description="the location management or search action to perform on the client device")
    geofence_id: Optional[str] = Field(
        default=None,
        description="geofence id to target (required for delete_location)",
    )
    context_message: Optional[str] = Field(
        default=None,
        description="message to store as location context (for set_location_context)",
    )
    category: Optional[str] = Field(
        default=None,
        description=(
            "place category for search_nearby_places. "
            "Valid values: grocery, pharmacy, hospital, urgent_care, gas_station, "
            "coffee_shop, restaurant, atm, bank, ev_charger, park, shopping, transit, airport"
        ),
    )
    place_id: Optional[str] = Field(
        default=None,
        description="Google place_id for show_place_details or save_favorite_place",
    )
    place_label: Optional[str] = Field(
        default=None,
        description="human-readable label for save_favorite_place",
    )
    open_now: Optional[bool] = Field(
        default=None,
        description="filter search_nearby_places to currently open places only",
    )
    radius_miles: Optional[float] = Field(
        default=None,
        description=(
            "search radius in miles for search_nearby_places. "
            "Set when the user specifies a distance ('within 5 miles', '10 mile radius', etc.). "
            "Do not set if the user does not mention a distance."
        ),
    )
    keyword: Optional[str] = Field(
        default=None,
        description=(
            "specific store name or brand to search for (e.g. 'Trader Joe\\'s', 'McDonald\\'s', 'CVS'). "
            "Set when the user names a specific chain or place. "
            "When set, the category should still reflect the type (e.g. grocery for Trader Joe\\'s, restaurant for McDonald\\'s)."
        ),
    )


class VedaReply(BaseModel):
    on_topic: bool = Field(
        description="whether the message is about Veda app features or the customer's travel plans"
    )
    reply: str = Field(
        description="short, friendly natural-language response to show the customer in all cases"
    )
    share_text: Optional[str] = Field(
        default=None,
        description="draft message to send/tell someone (filled only if user message implies messaging someone)",
    )
    location_action: Optional[LocationAction] = Field(
        default=None,
        description=(
            "location management or search action to execute on the client device — fill when the user:\n"
            "- asks to manage location settings or geofences (disable_tracking, pause_geofencing, etc.)\n"
            "- asks 'find me a [grocery/pharmacy/coffee/gas/etc] nearby' → search_nearby_places with category\n"
            "- asks to save a place as a favorite → save_favorite_place\n"
            "- asks to navigate or get directions → request_navigation\n"
            "- asks about their shopping list near a store → show_shopping_list_prompt\n"
            "Never fill location_action for 'where am I?' — answer directly from location context."
        ),
    )
