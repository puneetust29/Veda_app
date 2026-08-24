"""Intelligent airport-to-country mapper with hybrid caching strategy."""
from typing import Optional
import anthropic
from app.db.client import get_supabase

# Hardcoded mapping of common airports to countries (~150 most-used routes)
COMMON_AIRPORTS = {
    # United States
    "JFK": "United States",
    "LGA": "United States",
    "EWR": "United States",
    "ORD": "United States",
    "LAX": "United States",
    "SFO": "United States",
    "DEN": "United States",
    "ATL": "United States",
    "DFW": "United States",
    "MIA": "United States",
    "BOS": "United States",
    "SEA": "United States",
    "LAS": "United States",
    "PHX": "United States",
    "IAD": "United States",
    "IAH": "United States",
    "DAL": "United States",
    "PHL": "United States",

    # Europe
    "CDG": "France",
    "ORY": "France",
    "LHR": "United Kingdom",
    "LGW": "United Kingdom",
    "FCO": "Italy",
    "MXP": "Italy",
    "MAD": "Spain",
    "VY": "Spain",
    "AMS": "Netherlands",
    "TXL": "Germany",
    "BER": "Germany",
    "MUC": "Germany",
    "FRA": "Germany",
    "ZRH": "Switzerland",
    "GVA": "Switzerland",
    "VIE": "Austria",
    "PRG": "Czech Republic",
    "WAW": "Poland",
    "DUB": "Ireland",
    "MAN": "United Kingdom",
    "BHX": "United Kingdom",
    "LBA": "United Kingdom",
    "EDI": "United Kingdom",
    "ARI": "Greece",
    "BCN": "Spain",
    "BIO": "Spain",
    "TFS": "Spain",
    "IBZ": "Spain",
    "PMI": "Spain",
    "VLC": "Spain",
    "SVQ": "Spain",
    "VNO": "Lithuania",
    "RIX": "Latvia",
    "TLL": "Estonia",

    # Asia Pacific
    "PVG": "China",
    "SHA": "China",
    "PEK": "China",
    "CAN": "China",
    "CTU": "China",
    "CKG": "China",
    "XIY": "China",
    "HGH": "China",
    "NKG": "China",
    "KMG": "China",
    "TYO": "Japan",
    "HND": "Japan",
    "NRT": "Japan",
    "KIX": "Japan",
    "ICN": "South Korea",
    "GMP": "South Korea",
    "PUS": "South Korea",
    "NRT": "Japan",
    "SGN": "Vietnam",
    "DAD": "Vietnam",
    "HAN": "Vietnam",
    "BKK": "Thailand",
    "DMK": "Thailand",
    "SIN": "Singapore",
    "KUL": "Malaysia",
    "CGK": "Indonesia",
    "DPS": "Indonesia",
    "HKG": "Hong Kong",
    "TPE": "Taiwan",
    "DEL": "India",
    "BOM": "India",
    "MAA": "India",
    "BLR": "India",
    "SYD": "Australia",
    "MEL": "Australia",
    "BNE": "Australia",
    "PER": "Australia",
    "AKL": "New Zealand",
    "CHC": "New Zealand",

    # Middle East & Africa
    "DXB": "United Arab Emirates",
    "AUH": "United Arab Emirates",
    "DIA": "United Arab Emirates",
    "DOH": "Qatar",
    "JED": "Saudi Arabia",
    "RUH": "Saudi Arabia",
    "KWI": "Kuwait",
    "BAH": "Bahrain",
    "MCT": "Oman",
    "CAI": "Egypt",
    "HBE": "Egypt",
    "CIR": "Egypt",
    "JNB": "South Africa",
    "CPT": "South Africa",
    "NBO": "Kenya",
    "LAD": "Angola",
    "LUN": "Zambia",
    "LLW": "Lilongwe",
    "HRE": "Zimbabwe",

    # Latin America
    "MEX": "Mexico",
    "CUN": "Mexico",
    "MID": "Mexico",
    "GDL": "Mexico",
    "MTY": "Mexico",
    "PUJ": "Dominican Republic",
    "SJD": "Mexico",
    "PTY": "Panama",
    "MDE": "Colombia",
    "BOG": "Colombia",
    "CTG": "Colombia",
    "CCS": "Venezuela",
    "BRC": "Argentina",
    "MIA": "United States",
    "AEP": "Argentina",
    "EZE": "Argentina",
    "ROS": "Argentina",
    "MVD": "Uruguay",
    "SCL": "Chile",
    "PMC": "Chile",
    "IQT": "Ecuador",
    "UIO": "Ecuador",
    "LIM": "Peru",
    "SJO": "Costa Rica",
    "BZE": "Belize",
    "BGI": "Barbados",
    "GBZ": "Belize",
    "MBJ": "Jamaica",
    "KIN": "Jamaica",
    "VVI": "Bolivia",
    "ASU": "Paraguay",
    "FOR": "Brazil",
    "GIG": "Brazil",
    "GaleaoRio de Janeiro": "Brazil",
    "GRU": "Brazil",
    "SAO": "Brazil",
    "BSB": "Brazil",
    "CNF": "Brazil",
    "REC": "Brazil",
    "SSA": "Brazil",
}


def get_country_from_airport_cached(airport_code: str) -> Optional[str]:
    """Try to get country from hardcoded cache of common airports."""
    normalized_code = airport_code.upper().strip() if airport_code else ""
    return COMMON_AIRPORTS.get(normalized_code)


def get_country_from_airport_db(airport_code: str) -> Optional[str]:
    """Try to get country from Supabase airport_codes table cache."""
    try:
        supabase = get_supabase()
        result = (
            supabase.table("airport_codes")
            .select("country_name")
            .eq("code", airport_code.upper().strip())
            .single()
            .execute()
        )
        return result.data.get("country_name") if result.data else None
    except Exception:
        return None


def cache_airport_lookup(airport_code: str, country_name: str) -> None:
    """Cache a new airport-country mapping in Supabase."""
    try:
        supabase = get_supabase()
        supabase.table("airport_codes").upsert(
            {"code": airport_code.upper().strip(), "country_name": country_name}
        ).execute()
    except Exception:
        pass  # Silent fail - caching is optional


def get_country_from_airport_claude(airport_code: str) -> Optional[str]:
    """Use Claude with web search to identify country from airport code."""
    if not airport_code:
        return None

    try:
        client = anthropic.Anthropic()

        prompt = f"""You are an airport-to-country mapping assistant.
Given an airport code or city name, identify the country it belongs to.

Input: {airport_code}

Return ONLY the country name (e.g., "United States", "France", "Japan") in your response.
If you cannot identify the country, respond with "UNKNOWN".
Do not include any explanation or additional text."""

        message = client.messages.create(
            model="claude-opus-5",
            max_tokens=50,
            tools=[
                {
                    "name": "web_search",
                    "description": "Search the web for information about airports and their locations",
                    "input_schema": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": f"Search query to find what country {airport_code} airport is in"
                            }
                        },
                        "required": ["query"]
                    }
                }
            ],
            messages=[{"role": "user", "content": prompt}]
        )

        # Extract country name from response
        response_text = ""
        for block in message.content:
            if hasattr(block, "text"):
                response_text = block.text.strip()
                break

        if response_text and response_text != "UNKNOWN":
            return response_text
        return None
    except Exception:
        return None


def extract_country_from_event_text(event: dict) -> Optional[str]:
    """Try to extract country name from event description/title using Claude."""
    event_text = ""

    if event.get("title"):
        event_text += event["title"] + " "
    if event.get("raw_details", {}).get("email_subject"):
        event_text += event["raw_details"]["email_subject"] + " "
    if event.get("raw_details", {}).get("description"):
        event_text += event["raw_details"]["description"]

    if not event_text.strip():
        return None

    try:
        client = anthropic.Anthropic()

        prompt = f"""Extract the destination country from this flight event text.
Event: {event_text}

Return ONLY the country name (e.g., "United States", "France", "Japan").
If you cannot identify the country, respond with "UNKNOWN".
Do not include any explanation or additional text."""

        message = client.messages.create(
            model="claude-opus-5",
            max_tokens=50,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = ""
        for block in message.content:
            if hasattr(block, "text"):
                response_text = block.text.strip()
                break

        if response_text and response_text != "UNKNOWN":
            return response_text
        return None
    except Exception:
        return None


def get_destination_country(airport_code: str, event_dict: Optional[dict] = None) -> str:
    """
    Intelligently identify destination country from airport code or event.
    Uses hybrid strategy: hardcoded cache → DB cache → Claude web search → event text extraction.

    Returns: Country name string (e.g., "United States", "France") or "Unknown"
    """
    try:
        if not airport_code:
            return "Unknown"

        airport_code = airport_code.upper().strip()

        # Extract airport code from format like "Bangalore (BLR)" or "Paris CDG"
        import re
        match = re.search(r'\(([A-Z]{3})\)', airport_code)
        if match:
            airport_code = match.group(1)
        else:
            # Try to extract 3-letter code at the end: "Bangalore BLR" or "Paris ORY"
            match = re.search(r'\b([A-Z]{3})\b\s*$', airport_code)
            if match:
                airport_code = match.group(1)

        # Step 1: Try hardcoded cache (instant)
        country = get_country_from_airport_cached(airport_code)
        if country:
            return country

        # Step 2: Try database cache (Supabase lookup)
        country = get_country_from_airport_db(airport_code)
        if country:
            return country

        # Step 3: Use Claude with web search (intelligent fallback)
        country = get_country_from_airport_claude(airport_code)
        if country:
            cache_airport_lookup(airport_code, country)
            return country

        # Step 4: Try to extract from event text (last resort)
        if event_dict:
            country = extract_country_from_event_text(event_dict)
            if country:
                cache_airport_lookup(airport_code, country)
                return country

        return "Unknown"
    except Exception as e:
        # Silently fail and return "Unknown" - don't crash the sync
        import sys
        print(f"[WARN] Error in airport mapper for {airport_code}: {e}", file=sys.stderr)
        return "Unknown"
