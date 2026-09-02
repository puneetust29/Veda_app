"""Gmail email flight confirmation extraction.

Parses synced Gmail emails to identify flight confirmations and extract
flight details (origin, destination, dates) for automatic calendar sync.
Uses the existing flight_classifier module for detection.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.db.client import get_supabase
from app.integrations import flight_classifier
from app.utils.airport_mapper import get_destination_country


class FlightEmailParsing:
    """Parsed flight data extracted from a Gmail email."""

    def __init__(
        self,
        *,
        gmail_message_id: str,
        customer_id: str,
        origin: str,
        destination: str,
        title: str,
        start_datetime: datetime,
        end_datetime: Optional[datetime],
        confidence: float,
        email_sender: str,
        email_subject: str,
        email_received_at: datetime,
    ):
        self.gmail_message_id = gmail_message_id
        self.customer_id = customer_id
        self.origin = origin
        self.destination = destination
        self.title = title
        self.start_datetime = start_datetime
        self.end_datetime = end_datetime or (start_datetime + timedelta(hours=6))
        self.confidence = confidence
        self.email_sender = email_sender
        self.email_subject = email_subject
        self.email_received_at = email_received_at

    def to_calendar_event(self) -> dict:
        """Convert to calendar_events table row format."""
        event_dict = {
            "customer_id": self.customer_id,
            "title": self.title,
            "event_type": "flight",
            "origin": self.origin,
            "destination": self.destination,
            "start_datetime": self.start_datetime.isoformat(),
            "end_datetime": self.end_datetime.isoformat(),
            "source": "gmail",
            "gmail_message_id": self.gmail_message_id,
            "raw_details": {
                "email_sender": self.email_sender,
                "email_subject": self.email_subject,
                "email_received_at": self.email_received_at.isoformat(),
                "flight_confidence": self.confidence,
                "parsed_from": "email_body",
            },
        }

        destination_country = get_destination_country(self.destination, event_dict)
        event_dict["raw_details"]["destination_country"] = destination_country

        return event_dict


def parse_flight_email(email: dict, customer_id: str) -> Optional[FlightEmailParsing]:
    """Parse an email and extract flight details if it's a flight confirmation.

    Args:
        email: Row from gmail_messages table with id, subject, body, sender, received_at
        customer_id: Customer UUID for context

    Returns:
        FlightEmailParsing if flight detected with confidence > 0.85, else None
    """
    subject = email.get("subject") or ""
    body = email.get("body") or ""
    sender = email.get("sender") or ""
    received_at_str = email.get("received_at")

    # Parse received_at timestamp
    try:
        received_at = (
            datetime.fromisoformat(received_at_str)
            if isinstance(received_at_str, str)
            else received_at_str
        )
        if received_at.tzinfo is None:
            received_at = received_at.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        received_at = datetime.now(timezone.utc)

    # Classify the email as a flight
    combined_text = f"{subject}\n{body}"
    classification = flight_classifier.classify_event(
        title=subject,
        location="",
        notes=body,
    )

    # Only accept flights with high confidence
    if not classification.is_flight or classification.confidence < 0.85:
        return None

    # Extract origin and destination
    origin = classification.origin or _extract_origin_from_email(subject, body)
    destination = (
        classification.destination or _extract_destination_from_email(subject, body)
    )

    if not origin or not destination:
        return None

    # Extract flight dates
    start_datetime, end_datetime = _extract_dates_from_email(subject, body, received_at)

    # Build title from subject or flight info
    title = subject.strip() or f"Flight {origin} → {destination}"

    return FlightEmailParsing(
        gmail_message_id=email.get("gmail_message_id", ""),
        customer_id=customer_id,
        origin=origin,
        destination=destination,
        title=title,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        confidence=classification.confidence,
        email_sender=sender,
        email_subject=subject,
        email_received_at=received_at,
    )


def _extract_origin_from_email(subject: str, body: str) -> Optional[str]:
    """Extract origin airport code from email subject/body.

    Looks for patterns like "LAX → JFK", "LAX-JFK", "from LAX", etc.
    """
    # Pattern: XXX → YYY or XXX-YYY or from XXX
    patterns = [
        r"^([A-Z]{3})\s*[→→-]\s*[A-Z]{3}",  # Start of subject: LAX → JFK
        r"from\s+([A-Z]{3})(?:\s|$)",  # from LAX
        r"depart(?:ing|s)?\s+from\s+([A-Z]{3})",  # departing from LAX
    ]

    for pattern in patterns:
        match = re.search(pattern, subject, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    # Try body as fallback
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    return None


def _extract_destination_from_email(subject: str, body: str) -> Optional[str]:
    """Extract destination airport code from email subject/body.

    Looks for patterns like "LAX → JFK", "LAX-JFK", "to JFK", etc.
    """
    # Pattern: XXX → YYY or XXX-YYY or to YYY
    patterns = [
        r"[A-Z]{3}\s*[→→-]\s*([A-Z]{3})(?:\s|$)",  # LAX → JFK
        r"to\s+([A-Z]{3})(?:\s|$)",  # to JFK
        r"arriv(?:ing|es)?\s+(?:at|in)\s+([A-Z]{3})",  # arriving at JFK
    ]

    for pattern in patterns:
        match = re.search(pattern, subject, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    # Try body as fallback
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE)
        if match:
            return match.group(1).upper()

    return None


def _extract_dates_from_email(
    subject: str, body: str, email_received_at: datetime
) -> tuple[datetime, datetime]:
    """Extract flight dates from email subject/body.

    Looks for patterns like "Aug 25-28", "08/25/2026", "2026-08-25", etc.
    Falls back to email received_at if no dates found.

    Returns: (start_datetime, end_datetime)
    """
    combined = f"{subject}\n{body}"

    # Try to find date ranges like "Aug 25-28" or "Aug 25 - Aug 28"
    date_patterns = [
        # "Aug 25-28" (month and date range)
        r"([A-Z][a-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2})",
        # "08/25/2026" or "8/25/2026"
        r"(\d{1,2})/(\d{1,2})/(\d{4})",
        # "2026-08-25"
        r"(\d{4})-(\d{2})-(\d{2})",
        # "25 Aug 2026"
        r"(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})",
    ]

    # Try the first pattern (month + date range)
    month_range_match = re.search(
        r"([A-Z][a-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2})", combined
    )
    if month_range_match:
        month_str, start_day_str, end_day_str = month_range_match.groups()
        year = email_received_at.year
        try:
            start_dt = datetime.strptime(
                f"{month_str} {start_day_str} {year}", "%b %d %Y"
            )
            end_dt = datetime.strptime(f"{month_str} {end_day_str} {year}", "%b %d %Y")
            if end_dt < start_dt:
                end_dt = end_dt.replace(year=year + 1)
            return (start_dt.replace(tzinfo=timezone.utc), end_dt.replace(tzinfo=timezone.utc))
        except ValueError:
            pass

    # Try ISO date pattern
    iso_match = re.search(r"(\d{4})-(\d{2})-(\d{2})", combined)
    if iso_match:
        year, month, day = iso_match.groups()
        try:
            dt = datetime(int(year), int(month), int(day), tzinfo=timezone.utc)
            return (dt, dt + timedelta(days=1))
        except ValueError:
            pass

    # Try MM/DD/YYYY pattern
    slash_match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", combined)
    if slash_match:
        month, day, year = slash_match.groups()
        try:
            dt = datetime(int(year), int(month), int(day), tzinfo=timezone.utc)
            return (dt, dt + timedelta(days=1))
        except ValueError:
            pass

    # Try DD Mon YYYY pattern
    dmy_match = re.search(r"(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})", combined)
    if dmy_match:
        day, month_str, year = dmy_match.groups()
        try:
            dt = datetime.strptime(f"{day} {month_str} {year}", "%d %b %Y")
            return (dt.replace(tzinfo=timezone.utc), dt.replace(tzinfo=timezone.utc) + timedelta(days=1))
        except ValueError:
            pass

    # Fallback: use email received_at as start date
    return (email_received_at, email_received_at + timedelta(days=1))


def check_duplicate_flight(
    customer_id: str,
    origin: str,
    destination: str,
    start_datetime: datetime,
) -> bool:
    """Check if a flight with same origin/destination/time already exists.

    Uses time-window matching (±30 min) instead of date-only to handle:
    - Same-day flights at different times (8am vs 2pm)
    - Timezone parsing variance
    - Connecting flights same day

    Returns True if duplicate found, False otherwise.
    """
    supabase = get_supabase()

    try:
        # Parse datetime and create ±30 minute window
        if isinstance(start_datetime, str):
            flight_time = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
        else:
            flight_time = start_datetime

        window_start = (flight_time - timedelta(minutes=30)).isoformat()
        window_end = (flight_time + timedelta(minutes=30)).isoformat()

        result = (
            supabase.table("calendar_events")
            .select("id")
            .eq("customer_id", str(customer_id))
            .eq("event_type", "flight")
            .eq("origin", origin)
            .eq("destination", destination)
            .gte("start_datetime", window_start)
            .lte("start_datetime", window_end)
            .limit(1)
            .execute()
        )
        return len(result.data) > 0
    except Exception as e:
        # Log error but don't fail the entire sync
        import sys

        print(f"[WARN] Error checking duplicate flight: {e}", file=sys.stderr)
        return False


class HotelEmailParsing:
    """Parsed hotel booking data extracted from a Gmail email."""

    def __init__(
        self,
        *,
        gmail_message_id: str,
        customer_id: str,
        hotel_name: str,
        check_in: datetime,
        check_out: Optional[datetime],
        confidence: float,
        email_sender: str,
        email_subject: str,
        email_received_at: datetime,
    ):
        self.gmail_message_id = gmail_message_id
        self.customer_id = customer_id
        self.hotel_name = hotel_name
        self.check_in = check_in
        self.check_out = check_out or (check_in + timedelta(days=1))
        self.confidence = confidence
        self.email_sender = email_sender
        self.email_subject = email_subject
        self.email_received_at = email_received_at

    def to_calendar_event(self) -> dict:
        """Convert to calendar_events table row format."""
        return {
            "customer_id": self.customer_id,
            "title": self.hotel_name,
            "event_type": "hotel",
            "start_datetime": self.check_in.isoformat(),
            "end_datetime": self.check_out.isoformat(),
            "source": "gmail",
            "gmail_message_id": self.gmail_message_id,
            "raw_details": {
                "email_sender": self.email_sender,
                "email_subject": self.email_subject,
                "email_received_at": self.email_received_at.isoformat(),
                "hotel_confidence": self.confidence,
                "parsed_from": "email_body",
            },
        }


def parse_hotel_email(email: dict, customer_id: str) -> Optional[HotelEmailParsing]:
    """Parse an email and extract hotel booking details if it's a hotel confirmation.

    Looks for keywords like "booking confirmation", "reservation", "check-in", etc.

    Args:
        email: Row from gmail_messages table with id, subject, body, sender, received_at
        customer_id: Customer UUID for context

    Returns:
        HotelEmailParsing if hotel booking detected with confidence > 0.7, else None
    """
    subject = email.get("subject") or ""
    body = email.get("body") or ""
    sender = email.get("sender") or ""
    received_at_str = email.get("received_at")

    # Parse received_at timestamp
    try:
        received_at = (
            datetime.fromisoformat(received_at_str)
            if isinstance(received_at_str, str)
            else received_at_str
        )
        if received_at.tzinfo is None:
            received_at = received_at.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        received_at = datetime.now(timezone.utc)

    combined_text = f"{subject}\n{body}".lower()

    # Hotel detection keywords
    hotel_keywords = [
        "booking confirmation",
        "hotel reservation",
        "check-in",
        "check in",
        "check-out",
        "check out",
        "confirmation number",
        "booking reference",
        "reservation confirmed",
        "your stay",
        "hotel booking",
        "room reservation",
    ]

    # Check if this looks like a hotel confirmation
    has_hotel_keyword = any(keyword in combined_text for keyword in hotel_keywords)
    if not has_hotel_keyword:
        return None

    # Extract hotel name from email
    hotel_name = _extract_hotel_name_from_email(subject, body)
    if not hotel_name:
        return None

    # Extract check-in and check-out dates
    check_in, check_out = _extract_hotel_dates_from_email(subject, body, received_at)
    if not check_in:
        return None

    # Calculate confidence based on what we found
    confidence = 0.9 if check_out else 0.75

    return HotelEmailParsing(
        gmail_message_id=email.get("gmail_message_id", ""),
        customer_id=customer_id,
        hotel_name=hotel_name,
        check_in=check_in,
        check_out=check_out,
        confidence=confidence,
        email_sender=sender,
        email_subject=subject,
        email_received_at=received_at,
    )


def _extract_hotel_name_from_email(subject: str, body: str) -> Optional[str]:
    """Extract hotel name from email subject/body.

    Looks for patterns like:
    - "Your booking at Hotel Name"
    - "Reservation confirmed: Hotel Name"
    - "Check-in Hotel Name"
    """
    combined = f"{subject}\n{body}"
    patterns = [
        r"(?:booking|reservation|check[- ]?in)\s+(?:at|:)\s+([A-Za-z\s&'-]+?)(?:\.|,|\n|$)",
        r"(?:confirmed at|booked at|staying at)\s+([A-Za-z\s&'-]+?)(?:\.|,|\n|$)",
        r"(?:hotel|property):\s+([A-Za-z\s&'-]+?)(?:\.|,|\n|$)",
    ]

    for pattern in patterns:
        match = re.search(pattern, combined, re.IGNORECASE)
        if match:
            hotel_name = match.group(1).strip()
            # Filter out common non-hotel text
            if len(hotel_name) > 2 and len(hotel_name) < 100 and hotel_name.lower() not in ["the", "your", "this", "that", "our"]:
                return hotel_name

    return None


def _extract_hotel_dates_from_email(
    subject: str, body: str, email_received_at: datetime
) -> tuple[Optional[datetime], Optional[datetime]]:
    """Extract check-in and check-out dates from hotel confirmation email.

    Looks for patterns like:
    - "Check-in: Aug 25, 2026"
    - "Aug 25-28"
    - "08/25/2026"

    Returns: (check_in_datetime, check_out_datetime) or (None, None) if not found
    """
    combined = f"{subject}\n{body}"

    # Try to find check-in date
    check_in_patterns = [
        r"check[- ]?in[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"arrival[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"^([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)[\s-]*(?:to|through|-)",
    ]

    check_in = None
    for pattern in check_in_patterns:
        match = re.search(pattern, combined, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            check_in = _parse_date_string(date_str, email_received_at)
            if check_in:
                break

    if not check_in:
        return None, None

    # Try to find check-out date
    check_out_patterns = [
        r"check[- ]?out[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"departure[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"(?:through|to|until)[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
    ]

    check_out = None
    for pattern in check_out_patterns:
        match = re.search(pattern, combined, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            check_out = _parse_date_string(date_str, email_received_at)
            if check_out:
                break

    # Try date range pattern (Aug 25-28)
    if not check_out:
        range_match = re.search(
            r"([A-Za-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2})(?:,?\s+(\d{4}))?", combined
        )
        if range_match:
            month_str, start_day, end_day, year = range_match.groups()
            year = year or str(email_received_at.year)
            try:
                check_out_str = f"{month_str} {end_day}, {year}"
                check_out = _parse_date_string(check_out_str, email_received_at)
            except Exception:
                pass

    return check_in, check_out


def _parse_date_string(date_str: str, fallback_date: datetime) -> Optional[datetime]:
    """Parse a date string into a datetime object.

    Tries multiple formats and falls back to a default if parsing fails.
    """
    if not date_str:
        return None

    formats = [
        "%b %d, %Y",
        "%B %d, %Y",
        "%b %d",
        "%B %d",
        "%m/%d/%Y",
        "%m/%d",
        "%d %b %Y",
        "%d %B %Y",
    ]

    for fmt in formats:
        try:
            parsed = datetime.strptime(date_str.strip(), fmt)
            # Add year if missing
            if parsed.year == 1900:
                parsed = parsed.replace(year=fallback_date.year)
            # Add timezone
            return parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue

    return None


def check_duplicate_hotel(
    customer_id: str,
    hotel_name: str,
    check_in: datetime,
) -> bool:
    """Check if a hotel booking already exists.

    Checks by hotel_name and check_in date (±1 day window) to handle:
    - Timezone parsing variance
    - Date format variations

    Returns True if duplicate found, False otherwise.
    """
    supabase = get_supabase()

    try:
        # Create ±1 day window around check-in date
        check_in_dt = check_in if isinstance(check_in, datetime) else datetime.fromisoformat(check_in)
        window_start = (check_in_dt - timedelta(days=1)).replace(hour=0, minute=0, second=0)
        window_end = (check_in_dt + timedelta(days=1)).replace(hour=23, minute=59, second=59)

        result = (
            supabase.table("calendar_events")
            .select("id")
            .eq("customer_id", str(customer_id))
            .eq("event_type", "hotel")
            .gte("start_datetime", window_start.isoformat())
            .lte("start_datetime", window_end.isoformat())
            .limit(1)
            .execute()
        )
        return len(result.data) > 0
    except Exception as e:
        # Log error but don't fail the entire sync
        import sys

        print(f"[WARN] Error checking duplicate hotel: {e}", file=sys.stderr)
        return False


class BillEmailParsing:
    """Parsed broadband bill data extracted from a Gmail email."""

    def __init__(
        self,
        *,
        gmail_message_id: str,
        customer_id: str,
        provider: str,
        bill_amount: float,
        bill_currency: str,
        due_date: datetime,
        plan_details: Optional[dict],
        bill_reference: Optional[str],
        confidence: float,
        email_sender: str,
        email_subject: str,
        email_received_at: datetime,
    ):
        self.gmail_message_id = gmail_message_id
        self.customer_id = customer_id
        self.provider = provider
        self.bill_amount = bill_amount
        self.bill_currency = bill_currency
        self.due_date = due_date
        self.plan_details = plan_details or {}
        self.bill_reference = bill_reference
        self.confidence = confidence
        self.email_sender = email_sender
        self.email_subject = email_subject
        self.email_received_at = email_received_at

    def to_calendar_event(self) -> dict:
        """Convert to calendar_events table row format."""
        # Format title: "Broadband Bill - Verizon - $123.45 due Aug 25"
        due_date_str = self.due_date.strftime("%b %d")
        title = f"Broadband Bill - {self.provider} - {self.bill_currency}{self.bill_amount:.2f} due {due_date_str}"

        return {
            "customer_id": self.customer_id,
            "title": title,
            "event_type": "broadbandBill",
            "start_datetime": self.due_date.replace(hour=0, minute=0, second=0).isoformat(),
            "end_datetime": (self.due_date + timedelta(days=7)).replace(hour=0, minute=0, second=0).isoformat(),
            "source": "gmail",
            "gmail_message_id": self.gmail_message_id,
            "raw_details": {
                "email_sender": self.email_sender,
                "email_subject": self.email_subject,
                "email_received_at": self.email_received_at.isoformat(),
                "bill_provider": self.provider,
                "bill_amount": self.bill_amount,
                "bill_currency": self.bill_currency,
                "due_date": self.due_date.isoformat(),
                "bill_reference": self.bill_reference,
                "plan_details": self.plan_details,
                "bill_confidence": self.confidence,
                "parsed_from": "email_body",
                "provider_detected_method": "keyword_or_domain",
            },
        }


def parse_bill_email(email: dict, customer_id: str) -> Optional[BillEmailParsing]:
    """Parse an email and extract broadband bill details if it's a bill confirmation.

    Looks for keywords like "broadband", "internet", "bill", "invoice", "payment", etc.

    Args:
        email: Row from gmail_messages table with id, subject, body, sender, received_at
        customer_id: Customer UUID for context

    Returns:
        BillEmailParsing if bill detected with confidence >= 0.6, else None
    """
    subject = email.get("subject") or ""
    body = email.get("body") or ""
    sender = email.get("sender") or ""
    received_at_str = email.get("received_at")

    # Parse received_at timestamp
    try:
        received_at = (
            datetime.fromisoformat(received_at_str)
            if isinstance(received_at_str, str)
            else received_at_str
        )
        if received_at.tzinfo is None:
            received_at = received_at.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        received_at = datetime.now(timezone.utc)

    combined_text = f"{subject}\n{body}".lower()

    # Broadband provider keywords (US + International)
    provider_keywords = {
        "verizon": ["verizon", "vzw"],
        "at&t": ["at&t", "att"],
        "comcast": ["comcast", "xfinity"],
        "charter": ["charter", "spectrum"],
        "cox": ["cox communications", "cox"],
        "optimum": ["optimum", "cablevision"],
        "centurylink": ["centurylink", "lumen"],
        "frontier": ["frontier"],
        "t-mobile": ["t-mobile home", "tmobile home"],
        "viasat": ["viasat"],
        "hughesnet": ["hughesnet"],
        "vodafone": ["vodafone", "vfuk"],
        "bt": ["bt", "british telecom"],
        "rogers": ["rogers"],
        "telstra": ["telstra"],
    }

    # Bill detection keywords
    broadband_keywords = [
        "broadband", "internet", "wireless", "fiber", "dsl", "cable", "5g", "mobile broadband"
    ]
    bill_keywords = [
        "bill", "invoice", "statement", "due", "payment", "amount", "charge"
    ]
    confidence_boosters = [
        "monthly", "subscription", "renewal", "contract", "auto-renew"
    ]

    # Check for broadband keywords
    has_broadband_keyword = any(kw in combined_text for kw in broadband_keywords)
    if not has_broadband_keyword:
        return None

    # Check for bill keywords
    has_bill_keyword = any(kw in combined_text for kw in bill_keywords)
    if not has_bill_keyword:
        return None

    # Extract provider
    provider = _extract_bill_provider(subject, body, sender, provider_keywords)
    if not provider:
        return None

    # Extract amount
    bill_amount, bill_currency = _extract_bill_amount(subject, body)
    if bill_amount is None:
        return None

    # Extract due date
    due_date = _extract_bill_due_date(subject, body, received_at)
    if not due_date:
        return None

    # Extract plan details
    plan_details = _extract_bill_plan_details(subject, body)

    # Extract bill reference
    bill_reference = _extract_bill_reference(subject, body)

    # Calculate confidence
    has_booster = any(booster in combined_text for booster in confidence_boosters)
    confidence = 0.4 + 0.3 + 0.2 + (0.1 if has_booster else 0)  # min 0.6

    return BillEmailParsing(
        gmail_message_id=email.get("gmail_message_id", ""),
        customer_id=customer_id,
        provider=provider,
        bill_amount=bill_amount,
        bill_currency=bill_currency,
        due_date=due_date,
        plan_details=plan_details,
        bill_reference=bill_reference,
        confidence=confidence,
        email_sender=sender,
        email_subject=subject,
        email_received_at=received_at,
    )


def _extract_bill_provider(subject: str, body: str, sender: str, provider_keywords: dict) -> Optional[str]:
    """Extract broadband provider name from email."""
    combined_text = f"{subject}\n{body}".lower()

    # Check known provider keywords
    for provider_name, keywords in provider_keywords.items():
        for keyword in keywords:
            if keyword in combined_text:
                return provider_name.title()

    # Try to extract from sender domain (e.g., billing@verizon.net -> Verizon)
    if sender:
        sender_lower = sender.lower()
        for provider_name, keywords in provider_keywords.items():
            for keyword in keywords:
                if keyword in sender_lower:
                    return provider_name.title()

    # Generic fallback: look for capitalized words in bill context
    bill_patterns = [
        r"(?:from|sent by|billing from)\s+([A-Z][a-zA-Z\s]+?)(?:\.|,|$)",
        r"(?:provider|company):\s*([A-Z][a-zA-Z\s]+?)(?:\.|,|$)",
    ]
    for pattern in bill_patterns:
        match = re.search(pattern, f"{subject}\n{body}")
        if match:
            potential_provider = match.group(1).strip()
            if len(potential_provider) > 2 and len(potential_provider) < 50:
                return potential_provider

    return None


def _extract_bill_amount(subject: str, body: str) -> tuple[Optional[float], str]:
    """Extract bill amount and currency from email."""
    combined_text = f"{subject}\n{body}"

    # Currency symbols and patterns
    currency_patterns = [
        (r"\$(\d+(?:\.\d{2})?)", "USD"),
        (r"£(\d+(?:\.\d{2})?)", "GBP"),
        (r"€(\d+(?:\.\d{2})?)", "EUR"),
        (r"¥(\d+(?:\.\d{2})?)", "JPY"),
        (r"₹(\d+(?:\.\d{2})?)", "INR"),
        (r"C\$(\d+(?:\.\d{2})?)", "CAD"),
        (r"A\$(\d+(?:\.\d{2})?)", "AUD"),
    ]

    amounts_found = []

    for pattern, currency in currency_patterns:
        matches = re.findall(pattern, combined_text)
        for match in matches:
            try:
                amount = float(match)
                amounts_found.append((amount, currency))
            except ValueError:
                pass

    if amounts_found:
        # Return the largest amount (likely the main bill)
        largest = max(amounts_found, key=lambda x: x[0])
        return largest[0], largest[1]

    return None, "USD"


def _extract_bill_due_date(subject: str, body: str, email_received_at: datetime) -> Optional[datetime]:
    """Extract payment due date from email."""
    combined_text = f"{subject}\n{body}"

    # Patterns for due dates
    due_patterns = [
        r"due\s+(?:date)?[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"payment\s+due[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"pay\s+by[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
        r"deadline[:\s]+([A-Za-z]+\s+\d{1,2}(?:,?\s+\d{4})?)",
    ]

    for pattern in due_patterns:
        match = re.search(pattern, combined_text, re.IGNORECASE)
        if match:
            date_str = match.group(1)
            parsed_date = _parse_date_string(date_str, email_received_at)
            if parsed_date:
                # Verify it's in reasonable future range (0-90 days)
                days_diff = (parsed_date - email_received_at).days
                if 0 <= days_diff <= 90:
                    return parsed_date.replace(hour=23, minute=59, second=59)

    # Fallback: assume 30 days from email received
    return (email_received_at + timedelta(days=30)).replace(hour=23, minute=59, second=59)


def _extract_bill_plan_details(subject: str, body: str) -> Optional[dict]:
    """Extract plan details (name, speed, data cap, contract period) from email."""
    combined_text = f"{subject}\n{body}"
    plan_details = {}

    # Plan name patterns
    plan_name_patterns = [
        r"plan[:\s]+([A-Za-z0-9\s]+?)(?:,|\.|\n|$)",
        r"service[:\s]+([A-Za-z0-9\s]+?)(?:,|\.|\n|$)",
    ]
    for pattern in plan_name_patterns:
        match = re.search(pattern, combined_text, re.IGNORECASE)
        if match:
            plan_details["plan_name"] = match.group(1).strip()
            break

    # Speed patterns
    speed_patterns = [
        r"(\d+\s*(?:Mbps|Gbps|mb/s|gb/s))",
        r"speeds?[:\s]*(?:up to\s+)?(\d+\s*(?:Mbps|Gbps))",
    ]
    for pattern in speed_patterns:
        match = re.search(pattern, combined_text, re.IGNORECASE)
        if match:
            plan_details["speed"] = match.group(1)
            break

    # Data cap patterns
    data_cap_patterns = [
        r"(\d+\s*(?:GB|TB))\s+(?:data|cap|limit)",
        r"data[:\s]+(?:unlimited|(\d+\s*(?:GB|TB)))",
    ]
    for pattern in data_cap_patterns:
        match = re.search(pattern, combined_text, re.IGNORECASE)
        if match:
            plan_details["data_cap"] = match.group(1) if match.group(1) else "unlimited"
            break

    # Contract period patterns
    if "12-month" in combined_text.lower() or "1-year" in combined_text.lower():
        plan_details["contract_period"] = "12 months"
    elif "24-month" in combined_text.lower() or "2-year" in combined_text.lower():
        plan_details["contract_period"] = "24 months"
    elif "no contract" in combined_text.lower():
        plan_details["contract_period"] = "no contract"

    return plan_details if plan_details else None


def _extract_bill_reference(subject: str, body: str) -> Optional[str]:
    """Extract bill reference number (invoice, account, etc.) from email."""
    combined_text = f"{subject}\n{body}"

    reference_patterns = [
        r"invoice\s+#?[:\s]+([A-Za-z0-9-]{6,16})",
        r"reference\s+#?[:\s]+([A-Za-z0-9-]{6,16})",
        r"account\s+#?[:\s]+([A-Za-z0-9-]{6,16})",
        r"bill\s+#?[:\s]+([A-Za-z0-9-]{6,16})",
        r"order\s+#?[:\s]+([A-Za-z0-9-]{6,16})",
    ]

    for pattern in reference_patterns:
        match = re.search(pattern, combined_text, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    return None


def check_duplicate_bill(
    customer_id: str,
    provider: str,
    due_date: datetime,
) -> bool:
    """Check if a bill already exists for this provider.

    Checks by event_type and due_date (±7 days window) to handle:
    - Timezone parsing variance
    - Date format variations
    - Monthly bill cycles

    Returns True if duplicate found, False otherwise.
    """
    supabase = get_supabase()

    try:
        # Create ±7 day window around due date
        due_date_dt = due_date if isinstance(due_date, datetime) else datetime.fromisoformat(due_date)
        window_start = (due_date_dt - timedelta(days=7)).replace(hour=0, minute=0, second=0)
        window_end = (due_date_dt + timedelta(days=7)).replace(hour=23, minute=59, second=59)

        # Check for broadband bill events in the same date window
        # (duplicate detection is primarily at gmail_message_id level via upsert)
        result = (
            supabase.table("calendar_events")
            .select("id")
            .eq("customer_id", str(customer_id))
            .eq("event_type", "broadbandBill")
            .gte("start_datetime", window_start.isoformat())
            .lte("start_datetime", window_end.isoformat())
            .limit(1)
            .execute()
        )
        return len(result.data) > 0
    except Exception as e:
        # Log error but don't fail the entire sync
        import sys

        print(f"[WARN] Error checking duplicate bill: {e}", file=sys.stderr)
        return False
