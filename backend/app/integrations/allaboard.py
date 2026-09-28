"""All Aboard European rail ticketing — GraphQL client.

Auth: `api-key: <key>` request header (confirmed by live probe 2026-09-28).
Endpoint: test.api-gateway.allaboard.eu (test) / api-gateway.allaboard.eu (live).

Payment model: Wallet — createPayment is skipped entirely.
Flow: getLocations → journeys → journeyOffer → createBooking → createOrder → finalizeOrder.
GB tickets: bookable, but non-refundable/non-exchangeable by All Aboard policy.
"""
from __future__ import annotations

from typing import Any

import httpx

from app.config import get_settings


class AllAboardError(RuntimeError):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class AllAboardClient:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.allaboard_configured:
            raise AllAboardError("All Aboard API key not configured (ALLABOARD_API_KEY)", 503)
        self._client = httpx.Client(
            base_url=settings.allaboard_endpoint,
            headers={"api-key": settings.allaboard_api_key, "Content-Type": "application/json"},
            timeout=30,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "AllAboardClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _gql(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables
        r = self._client.post("", json=payload)
        r.raise_for_status()
        body = r.json()
        if "errors" in body:
            raise AllAboardError(body["errors"][0]["message"])
        return body["data"]

    # ------------------------------------------------------------------
    # Location search
    # ------------------------------------------------------------------

    def search_locations(self, query: str) -> list[dict]:
        """Return stations matching the search string."""
        data = self._gql(
            """
            query SearchLocations($q: String!) {
              getLocations(query: $q) {
                uid
                name
                countryCode
                isMeta
              }
            }
            """,
            {"q": query},
        )
        return data["getLocations"]

    # ------------------------------------------------------------------
    # Journey search
    # ------------------------------------------------------------------

    _JOURNEY_FIELDS = """
        id
        status
        itinerary {
          ... on SegmentCollection {
            segments {
              origin { name }
              destination { name }
              departureAt
              arrivalAt
              duration
              transport
              operator { name }
            }
          }
        }
    """

    def search_journeys(
        self,
        origin_uid: str,
        destination_uid: str,
        date: str,
        passengers: list[dict] | None = None,
        currency: str = "GBP",
    ) -> list[dict]:
        """Search journeys between two station UIDs on a given date (YYYY-MM-DD)."""
        data = self._gql(
            f"""
            query SearchJourneys(
              $origin: LocationInput!
              $destination: LocationInput!
              $date: Date!
              $passengers: [PassengerPlaceholderInput!]
              $currency: String
            ) {{
              journeys(
                origin: $origin
                destination: $destination
                date: $date
                passengers: $passengers
                currency: $currency
              ) {{
                {self._JOURNEY_FIELDS}
              }}
            }}
            """,
            {
                "origin": {"uid": origin_uid},
                "destination": {"uid": destination_uid},
                "date": date,
                "passengers": passengers or [{"type": "ADULT"}],
                "currency": currency,
            },
        )
        return data["journeys"]

    # ------------------------------------------------------------------
    # Pricing / offers
    # ------------------------------------------------------------------

    def get_journey_offer(
        self,
        journey_id: str,
        passengers: list[dict] | None = None,
        currency: str = "GBP",
    ) -> dict:
        """Fetch priced fare offers for a journey."""
        data = self._gql(
            """
            query JourneyOffer(
              $journeyId: ID!
              $passengers: [PassengerPlaceholderInput!]!
              $currency: String
            ) {
              journeyOffer(
                journeyId: $journeyId
                passengers: $passengers
                currency: $currency
              ) {
                id
                status
                itinerary {
                  ... on SegmentCollection {
                    segments {
                      origin { name }
                      destination { name }
                      departureAt
                      arrivalAt
                      duration
                      operator { name }
                    }
                    offers {
                      id
                      price { amount currency }
                    }
                  }
                }
              }
            }
            """,
            {
                "journeyId": journey_id,
                "passengers": passengers or [{"type": "ADULT"}],
                "currency": currency,
            },
        )
        return data["journeyOffer"]

    # ------------------------------------------------------------------
    # Booking (Wallet flow — createPayment skipped)
    # ------------------------------------------------------------------

    def create_booking(self, offer_ids: list[str], currency: str = "GBP") -> dict:
        """Reserve offers and return a booking (hold, not yet confirmed)."""
        data = self._gql(
            """
            mutation CreateBooking($offerIds: [ID!]!, $currency: String) {
              createBooking(offerIds: $offerIds, currency: $currency) {
                id
                expiresAt
                totalPrice { amount currency }
              }
            }
            """,
            {"offerIds": offer_ids, "currency": currency},
        )
        return data["createBooking"]

    def update_booking(self, booking_id: str, passengers: list[dict]) -> dict:
        """Add full passenger details to a booking (required before createOrder)."""
        data = self._gql(
            """
            mutation UpdateBooking($id: ID!, $passengers: [FullPassengerInput!]) {
              updateBooking(id: $id, passengers: $passengers) {
                id
                expiresAt
                totalPrice { amount currency }
              }
            }
            """,
            {"id": booking_id, "passengers": passengers},
        )
        return data["updateBooking"]

    def create_order(self, booking_id: str) -> dict:
        """Convert a booking hold into a confirmed order (Wallet: no createPayment needed)."""
        data = self._gql(
            """
            mutation CreateOrder($booking: ID!) {
              createOrder(booking: $booking) {
                id
                status
                reference
                totalPrice { amount currency }
              }
            }
            """,
            {"booking": booking_id},
        )
        return data["createOrder"]

    def finalize_order(self, order_id: str) -> dict:
        """Finalize the order — deducts from Wallet balance and issues the ticket."""
        data = self._gql(
            """
            mutation FinalizeOrder($order: ID!) {
              finalizeOrder(order: $order) {
                id
                status
                reference
                totalPrice { amount currency }
              }
            }
            """,
            {"order": order_id},
        )
        return data["finalizeOrder"]
