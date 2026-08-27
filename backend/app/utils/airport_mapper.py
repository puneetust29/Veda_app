"""Intelligent airport-to-country mapper with hybrid caching strategy."""
from typing import Optional
import anthropic
from app.config import get_settings
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


# "<city>, <region abbreviation>" destinations (e.g. "New York, NY", "Toronto, ON")
# carry no airport code at all, so they need a region-code lookup instead. Built from
# each country's official state/province/territory postal abbreviations; codes that
# collide across countries (e.g. Australia's WA/NT also being US state codes) are
# deliberately left out since there's no reliable way to disambiguate from the
# abbreviation alone -- those destinations fall through to the airport-code /
# Claude-lookup paths below instead of risking a wrong country.
REGION_ABBREVIATION_TO_COUNTRY = {
    # US states + DC
    "AL": "United States", "AK": "United States", "AZ": "United States", "AR": "United States",
    "CA": "United States", "CO": "United States", "CT": "United States", "DE": "United States",
    "FL": "United States", "GA": "United States", "HI": "United States", "ID": "United States",
    "IL": "United States", "IN": "United States", "IA": "United States", "KS": "United States",
    "KY": "United States", "LA": "United States", "ME": "United States", "MD": "United States",
    "MA": "United States", "MI": "United States", "MN": "United States", "MS": "United States",
    "MO": "United States", "MT": "United States", "NE": "United States", "NV": "United States",
    "NH": "United States", "NJ": "United States", "NM": "United States", "NY": "United States",
    "NC": "United States", "ND": "United States", "OH": "United States", "OK": "United States",
    "OR": "United States", "PA": "United States", "RI": "United States", "SC": "United States",
    "SD": "United States", "TN": "United States", "TX": "United States", "UT": "United States",
    "VT": "United States", "VA": "United States", "WA": "United States", "WV": "United States",
    "WI": "United States", "WY": "United States", "DC": "United States",
    # Canadian provinces + territories (no collisions with US postal codes)
    "AB": "Canada", "BC": "Canada", "MB": "Canada", "NB": "Canada", "NL": "Canada",
    "NS": "Canada", "ON": "Canada", "PE": "Canada", "QC": "Canada", "SK": "Canada",
    "YT": "Canada", "NU": "Canada",
    # Australian states/territories that don't collide with a US/Canadian code above
    # (WA, NT, SA are ambiguous with US/ISO codes and are skipped)
    "VIC": "Australia", "QLD": "Australia", "TAS": "Australia", "ACT": "Australia",
    "NSW": "Australia",
}


def get_country_from_region_abbreviation(destination_text: str) -> Optional[str]:
    """Match "<city>, <region abbreviation>" against known state/province/territory
    codes across countries whose destinations often lack an airport code entirely."""
    import re
    match = re.search(r',\s*([A-Z]{2,3})\s*$', destination_text.upper().strip())
    if match:
        return REGION_ABBREVIATION_TO_COUNTRY.get(match.group(1))
    return None


# Customer profiles store ISO-3166 alpha-2 codes (e.g. "US"), while destination
# resolution (airports, region abbreviations, roaming_plans.country_name) always deals
# in full country names (e.g. "United States") -- this bridges the two so callers like
# the roaming agent's home-country check can compare them directly.
ISO2_TO_COUNTRY_NAME = {
    "US": "United States", "GB": "United Kingdom", "FR": "France", "DE": "Germany",
    "IT": "Italy", "ES": "Spain", "NL": "Netherlands", "CH": "Switzerland",
    "AT": "Austria", "CZ": "Czech Republic", "PL": "Poland", "IE": "Ireland",
    "GR": "Greece", "LT": "Lithuania", "LV": "Latvia", "EE": "Estonia",
    "CN": "China", "JP": "Japan", "KR": "South Korea", "VN": "Vietnam",
    "TH": "Thailand", "SG": "Singapore", "MY": "Malaysia", "ID": "Indonesia",
    "HK": "Hong Kong", "TW": "Taiwan", "IN": "India", "AU": "Australia",
    "NZ": "New Zealand", "AE": "United Arab Emirates", "QA": "Qatar",
    "SA": "Saudi Arabia", "KW": "Kuwait", "BH": "Bahrain", "OM": "Oman",
    "EG": "Egypt", "ZA": "South Africa", "KE": "Kenya", "AO": "Angola",
    "ZM": "Zambia", "ZW": "Zimbabwe", "MX": "Mexico", "DO": "Dominican Republic",
    "PA": "Panama", "CO": "Colombia", "VE": "Venezuela", "AR": "Argentina",
    "UY": "Uruguay", "CL": "Chile", "EC": "Ecuador", "PE": "Peru",
    "CR": "Costa Rica", "BZ": "Belize", "BB": "Barbados", "JM": "Jamaica",
    "BO": "Bolivia", "PY": "Paraguay", "BR": "Brazil", "CA": "Canada",
    "MA": "Morocco",
}


def normalize_country_name(value: str) -> str:
    """Resolve an ISO-3166 alpha-2 code to its full country name; pass full names
    (or unrecognized codes) through unchanged."""
    if not value:
        return value
    normalized = value.strip().upper()
    return ISO2_TO_COUNTRY_NAME.get(normalized, value)


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
        client = anthropic.Anthropic(api_key=get_settings().anthropic_api_key)

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
        client = anthropic.Anthropic(api_key=get_settings().anthropic_api_key)

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


def is_domestic_flight(destination: Optional[str], customer_country: Optional[str]) -> bool:
    """
    Determine if a flight is domestic (destination in customer's home country).

    Args:
        destination: Airport code or city name of destination
        customer_country: Customer's home country (ISO code like "US" or full name like "United States")

    Returns: True if flight is within home country, False if international or unknown
    """
    if not destination or not customer_country:
        return False

    try:
        dest_country = get_destination_country(destination)

        # Convert ISO code to full country name if needed
        customer_country_full = normalize_country_name(customer_country)

        # Normalize both for comparison
        dest_normalized = dest_country.strip().lower() if dest_country else ""
        customer_normalized = customer_country_full.strip().lower() if customer_country_full else ""

        # Domestic if destination is in home country and not "Unknown"
        return (
            dest_normalized != "unknown" and
            customer_normalized != "unknown" and
            dest_normalized == customer_normalized
        )
    except Exception:
        # On any error, assume international (show badges to be safe)
        return False


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

        # "New York, NY" / "Toronto, ON" etc. -- a city + region abbreviation, not an
        # airport code.
        region_country = get_country_from_region_abbreviation(airport_code)
        if region_country:
            return region_country

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
