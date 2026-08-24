import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from fastapi.responses import HTMLResponse, RedirectResponse

from app.config import get_settings
from app.deps import get_current_customer
from app.routers._shared import get_owned_calendar_event
from app.tools import uber_mcp_client, uber_ride_options
from app.tools import uber_oauth, uber_session as _uber_session
from app.tools.uber_deeplink import (
    build_airport_deeplink_options,
    build_uber_deeplink,
    lookup_airport_coordinates,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/uber", tags=["uber"])


class AirportOption(BaseModel):
    label: str
    uber_app_url: str
    deep_link_url: str


class DeeplinkResponse(BaseModel):
    uber_app_url: Optional[str] = None       # uber:// scheme — opens native app, reliably pre-fills fields
    deep_link_url: Optional[str] = None      # https://m.uber.com/ul/ — web fallback if app not installed
    destination_label: Optional[str] = None  # Uber dropoff label (normally the departure airport)
    airport_options: list[AirportOption] = Field(default_factory=list)


class UberAuthUrlResponse(BaseModel):
    available: bool
    auth_url: Optional[str] = None
    message: str


class UberSessionResponse(BaseModel):
    connected: bool
    user_sub: Optional[str] = None
    connect_url: Optional[str] = None


@router.get("/session", response_model=UberSessionResponse)
def get_session_status(customer: dict = Depends(get_current_customer)) -> UberSessionResponse:
    """Return whether this customer has an active Uber session."""
    customer_id = customer["id"]
    token = _uber_session.get_valid_access_token(customer_id)
    if token:
        session = _uber_session.get_session(customer_id)
        return UberSessionResponse(connected=True, user_sub=session["user_sub"] if session else None)
    return UberSessionResponse(
        connected=False,
        connect_url=f"{get_settings().uber_mcp_url}/login/preview",
    )


@router.get("/options")
def get_ride_options(
    calendar_event_id: str,
    pickup_latitude: Optional[float] = None,
    pickup_longitude: Optional[float] = None,
    pickup_label: Optional[str] = None,
    customer: dict = Depends(get_current_customer),
):
    """Fetch live Uber ride prices for a trip, without re-running the full chat
    orchestration. Used to refresh the ride card right after the user connects
    their Uber account, since the original card was built before the token existed.
    """
    event = get_owned_calendar_event(calendar_event_id, customer["id"])
    device_location = None
    if pickup_latitude is not None and pickup_longitude is not None:
        device_location = {"latitude": pickup_latitude, "longitude": pickup_longitude, "label": pickup_label}

    return uber_ride_options.fetch(customer, event, device_location)


@router.get("/connect")
def start_connect(return_url: Optional[str] = None, customer: dict = Depends(get_current_customer)):
    """Start the Uber OAuth login flow for this customer. Returns the auth URL."""
    try:
        auth_url = uber_oauth.get_connect_url(customer["id"], return_url)
        return {"auth_url": auth_url}
    except Exception as exc:
        logger.error("[uber] connect start failed | customer_id=%s | error=%s", customer.get("id"), exc)
        raise HTTPException(status_code=502, detail=f"Could not start Uber login: {exc}")


@router.get("/callback")
def oauth_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
) -> HTMLResponse:
    """uber-mcp redirects here after the user completes Uber login.

    Exchanges the auth code for tokens, stores them, and returns a success page.
    No auth dependency — this endpoint is called by the browser redirect, not the app.
    """
    if error:
        logger.warning("[uber] oauth callback error | error=%s", error)
        return HTMLResponse(_callback_page(success=False, message=f"Login failed: {error}"))

    if not code or not state:
        return HTMLResponse(_callback_page(success=False, message="Missing code or state."))

    try:
        result = uber_oauth.exchange_code(code, state)
        _uber_session.upsert_session(
            customer_id=result["customer_id"],
            user_sub=result["user_sub"],
            access_token=result["access_token"],
            refresh_token=result["refresh_token"],
            client_id=result["client_id"],
            expires_in=result["expires_in"],
        )
        logger.info("[uber] oauth callback success | customer_id=%s | user_sub=%s", result["customer_id"], result["user_sub"])
        return HTMLResponse(_callback_page(success=True, return_url=result.get("return_url")))
    except Exception as exc:
        logger.error("[uber] oauth callback exchange failed | error=%s", exc)
        return HTMLResponse(_callback_page(success=False, message=str(exc)))


def _callback_page(success: bool, message: str = "", return_url: Optional[str] = None) -> str:
    if success:
        title, body, color = "Uber Connected!", "Your Uber account is linked. Returning you to Veda…", "#3A9E5F"
    else:
        title, body, color = "Connection Failed", message or "Something went wrong. Please try again.", "#C0302A"
    redirect_script = ""
    if success and return_url:
        redirect_script = f"""<script>setTimeout(function() {{ window.location.href = {json.dumps(return_url)}; }}, 900);</script>"""
    return f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<style>
  body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;font-family:-apple-system,sans-serif;color:#fff;padding:24px;box-sizing:border-box}}
  .card{{max-width:380px;width:100%;background:#0a0a0a;border:1px solid #222;border-radius:14px;padding:36px 28px;text-align:center}}
  .icon{{font-size:48px;margin-bottom:16px}}
  h1{{margin:0 0 12px;font-size:22px;font-weight:700;color:{color}}}
  p{{margin:0;color:#aaa;font-size:15px;line-height:1.6}}
</style></head><body>
<div class="card">
  <div class="icon">{'✓' if success else '✗'}</div>
  <h1>{title}</h1>
  <p>{body}</p>
</div>
{redirect_script}
</body></html>"""


@router.get("/auth-url", response_model=UberAuthUrlResponse)
def get_auth_url(customer: dict = Depends(get_current_customer)) -> UberAuthUrlResponse:
    """Return the uber-mcp re-auth URL when the session is expired or unavailable."""
    logger.info("[uber] auth-url request | customer_id=%s", customer.get("id"))
    if not uber_mcp_client.is_configured():
        return UberAuthUrlResponse(available=False, message="Uber MCP not configured.")

    try:
        result = uber_mcp_client.call_tool("uber_status_get", {"latitude": 0, "longitude": 0}, timeout=8.0)
        if result.get("result", {}).get("isError"):
            raise ValueError("session error")
        return UberAuthUrlResponse(available=True, message="Uber session active.")
    except Exception:
        cfg = get_settings()
        auth_url = f"{cfg.uber_mcp_url}/authorize"
        logger.info("[uber] auth-url session expired | returning re-auth url")
        return UberAuthUrlResponse(available=False, auth_url=auth_url, message="Uber session expired. Re-login required.")


class BookRideRequest(BaseModel):
    calendar_event_id: str
    product_name: str = "UberX"
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    pickup_label: Optional[str] = None


class BookRideResponse(BaseModel):
    trip_uuid: Optional[str] = None
    status: str
    message: str


@router.post("/book", response_model=BookRideResponse)
def book_ride(
    body: BookRideRequest,
    customer: dict = Depends(get_current_customer),
) -> BookRideResponse:
    """Book an Uber ride via uber-mcp. WARNING: charges the user's payment method."""
    if not uber_mcp_client.is_configured():
        raise HTTPException(status_code=503, detail="Uber MCP not configured.")

    event = get_owned_calendar_event(body.calendar_event_id, customer["id"])
    origin_label = event.get("origin") or ""

    logger.info(
        "[uber] book ride | customer_id=%s | product=%r | origin=%r | pickup_coords=%s",
        customer.get("id"),
        body.product_name,
        origin_label,
        body.pickup_latitude is not None,
    )

    # Use per-user token if available, else fall back to global dev token
    user_token = _uber_session.get_valid_access_token(customer["id"])

    try:
        args = {
            "pickup_query": body.pickup_label or "Current location",
            "dropoff_query": origin_label,
            "latitude": body.pickup_latitude or 0.0,
            "longitude": body.pickup_longitude or 0.0,
            "product_name": body.product_name,
        }
        result = (
            uber_mcp_client.call_tool_as(user_token, "uber_ride_book_quick", args, timeout=60.0)
            if user_token
            else uber_mcp_client.call_tool("uber_ride_book_quick", args, timeout=60.0)
        )
    except Exception as exc:
        logger.error("[uber] book ride mcp error | customer_id=%s | error=%s", customer.get("id"), exc)
        raise HTTPException(status_code=502, detail=f"Uber booking failed: {exc}")

    mcp_result = result.get("result", {})
    if mcp_result.get("isError"):
        text = (mcp_result.get("content") or [{}])[0].get("text", "Unknown error")
        logger.error("[uber] book ride mcp returned error | customer_id=%s | text=%r", customer.get("id"), text)
        raise HTTPException(status_code=502, detail=text)

    import json as _json
    text = (mcp_result.get("content") or [{}])[0].get("text", "{}")
    data = _json.loads(text) if isinstance(text, str) else text
    trip = (data.get("data") or {}).get("trip") or data.get("trip") or {}
    trip_uuid = trip.get("uuid") or trip.get("jobUUID")

    logger.info("[uber] book ride success | customer_id=%s | trip_uuid=%s", customer.get("id"), trip_uuid)
    return BookRideResponse(
        trip_uuid=trip_uuid,
        status=trip.get("status", "processing"),
        message=f"Your {body.product_name} has been booked!",
    )


@router.get("/deeplink", response_model=DeeplinkResponse)
def get_deeplink(
    calendar_event_id: str,
    pickup_latitude: Optional[float] = None,
    pickup_longitude: Optional[float] = None,
    pickup_label: Optional[str] = None,
    customer: dict = Depends(get_current_customer),
) -> DeeplinkResponse:
    """Deep link to hand a rider off to the Uber app for the departure leg of a trip.

    Pickup = rider's live device location when the mobile app provides coordinates,
    otherwise Uber resolves it from `pickup=my_location`.
    Dropoff = the trip's departure airport/station (the calendar event origin).

    This is intentional: when a user taps Uber from a London → Tokyo trip, they need a
    ride from where they are now to Heathrow — not an Uber route from London to Tokyo.

    The dropoff is looked up from the known-coordinates map. If the origin is only a
    city (for example "London"), we return curated airport options like Heathrow and
    Gatwick so the user can choose the right departure airport first.

    If the origin isn't in the map and no city-level airport options are known, Uber
    still opens with current location as the pickup and the rider can choose the
    destination manually in the app.

    No Uber account connection or OAuth is required -- see app/tools/uber_deeplink.py.
    """
    event = get_owned_calendar_event(calendar_event_id, customer["id"])
    origin_label = event.get("origin")
    destination_label = event.get("destination")

    logger.info(
        "[uber] deeplink request | event=%s | origin=%r | destination=%r | pickup_coords_present=%s | pickup_label=%r",
        calendar_event_id,
        origin_label,
        destination_label,
        pickup_latitude is not None and pickup_longitude is not None,
        pickup_label,
    )

    # Dropoff = departure airport / station (where the trip leaves from)
    dropoff_coords = lookup_airport_coordinates(origin_label)
    if dropoff_coords:
        dropoff_lat, dropoff_lng = dropoff_coords
        logger.info("[uber] dropoff_coords for departure %r -> %s", origin_label, dropoff_coords)

        uber_app_url, web_fallback_url = build_uber_deeplink(
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            pickup_nickname=pickup_label,
            dropoff_latitude=dropoff_lat,
            dropoff_longitude=dropoff_lng,
            dropoff_nickname=origin_label,
        )

        response = DeeplinkResponse(
            uber_app_url=uber_app_url,
            deep_link_url=web_fallback_url,
            destination_label=origin_label,
        )
        logger.info("[uber] response sent | uber_app_url=%s", response.uber_app_url)
        return response

    airport_options = [
        AirportOption(**option)
        for option in build_airport_deeplink_options(
            origin_label,
            pickup_latitude=pickup_latitude,
            pickup_longitude=pickup_longitude,
            pickup_nickname=pickup_label,
        )
    ]
    if airport_options:
        response = DeeplinkResponse(
            destination_label=origin_label,
            airport_options=airport_options,
        )
        logger.info("[uber] response sent with %d airport options", len(airport_options))
        return response

    uber_app_url, web_fallback_url = build_uber_deeplink(
        pickup_latitude=pickup_latitude,
        pickup_longitude=pickup_longitude,
        pickup_nickname=pickup_label,
    )

    response = DeeplinkResponse(
        uber_app_url=uber_app_url,
        deep_link_url=web_fallback_url,
        destination_label=origin_label,
    )
    logger.info("[uber] response sent | uber_app_url=%s", response.uber_app_url)
    return response
