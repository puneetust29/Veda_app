"""Airport-to-country mapper with hybrid caching strategy."""
import pytest
from app.utils.airport_mapper import (
    get_country_from_airport_cached,
    get_destination_country,
)


class TestAirportMapperCached:
    """Test hardcoded cache lookup for common airports."""

    def test_common_us_airports(self):
        """Test common US airport mappings."""
        assert get_country_from_airport_cached("JFK") == "United States"
        assert get_country_from_airport_cached("LAX") == "United States"
        assert get_country_from_airport_cached("ORD") == "United States"
        assert get_country_from_airport_cached("ATL") == "United States"

    def test_common_european_airports(self):
        """Test common European airport mappings."""
        assert get_country_from_airport_cached("CDG") == "France"
        assert get_country_from_airport_cached("LHR") == "United Kingdom"
        assert get_country_from_airport_cached("FRA") == "Germany"
        assert get_country_from_airport_cached("AMS") == "Netherlands"

    def test_asian_airports(self):
        """Test Asian airport mappings."""
        assert get_country_from_airport_cached("PVG") == "China"
        assert get_country_from_airport_cached("HND") == "Japan"
        assert get_country_from_airport_cached("SIN") == "Singapore"

    def test_case_insensitive(self):
        """Test that airport codes are case-insensitive."""
        assert get_country_from_airport_cached("jfk") == "United States"
        assert get_country_from_airport_cached("JfK") == "United States"

    def test_unknown_airport(self):
        """Test that unknown airports return None."""
        assert get_country_from_airport_cached("ZZZ") is None
        assert get_country_from_airport_cached("INVALID") is None

    def test_empty_code(self):
        """Test that empty codes return None."""
        assert get_country_from_airport_cached("") is None
        assert get_country_from_airport_cached(None) is None


class TestGetDestinationCountry:
    """Test the main get_destination_country function."""

    def test_common_airport_instant_lookup(self):
        """Test that common airports return instantly from cache."""
        result = get_destination_country("JFK")
        assert result == "United States"

    def test_unknown_airport_returns_unknown(self):
        """Test that unknown airports return 'Unknown'."""
        # Since we don't have Claude/DB fallback in tests, unknown airports should return "Unknown"
        result = get_destination_country("ZZZ")
        assert result == "Unknown"

    def test_empty_airport_returns_unknown(self):
        """Test that empty airport codes return 'Unknown'."""
        result = get_destination_country("")
        assert result == "Unknown"

    def test_with_event_dict(self):
        """Test that function accepts optional event_dict parameter."""
        event = {
            "title": "Flight to Paris",
            "raw_details": {"description": "Going to France"},
        }
        result = get_destination_country("JFK", event)
        assert result == "United States"

    def test_various_airports(self):
        """Test a variety of airports."""
        test_cases = [
            ("LGA", "United States"),
            ("ORD", "United States"),
            ("CDG", "France"),
            ("LHR", "United Kingdom"),
            ("MUC", "Germany"),
            ("SYD", "Australia"),
            ("NRT", "Japan"),
            ("DXB", "United Arab Emirates"),
        ]

        for airport_code, expected_country in test_cases:
            result = get_destination_country(airport_code)
            assert result == expected_country, f"Failed for {airport_code}: got {result}, expected {expected_country}"
