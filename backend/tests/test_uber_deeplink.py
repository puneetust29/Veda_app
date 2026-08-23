from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.deps import get_current_customer
from app.main import app
from app.routers import uber as uber_router
from app.tools.uber_deeplink import build_uber_deeplink


def test_build_uber_deeplink_defaults_to_current_location(monkeypatch):
    monkeypatch.setenv("UBER_CLIENT_ID", "test-client-id")
    from app.config import get_settings
    get_settings.cache_clear()

    uber_app_url, web_fallback_url = build_uber_deeplink()

    assert uber_app_url.startswith("uber://?")
    app_query = parse_qs(urlparse(uber_app_url).query)
    assert app_query["client_id"] == ["test-client-id"]
    assert app_query["action"] == ["setPickup"]
    assert app_query["pickup"] == ["my_location"]
    assert "dropoff[latitude]" not in uber_app_url

    parsed = urlparse(web_fallback_url)
    assert parsed.netloc == "m.uber.com"
    assert parsed.path == "/ul/"
    web_query = parse_qs(parsed.query)
    assert web_query["action"] == ["setPickup"]
    assert web_query["pickup"] == ["my_location"]


def test_build_uber_deeplink_includes_pickup_and_dropoff_when_coordinates_given(monkeypatch):
    monkeypatch.setenv("UBER_CLIENT_ID", "test-client-id")
    from app.config import get_settings
    get_settings.cache_clear()

    uber_app_url, web_fallback_url = build_uber_deeplink(
        pickup_latitude=51.5007,
        pickup_longitude=-0.1246,
        pickup_nickname="Central London",
        dropoff_latitude=51.5074,
        dropoff_longitude=-0.1278,
        dropoff_nickname="Paddington",
    )

    for url in (uber_app_url, web_fallback_url):
        query = parse_qs(urlparse(url).query)
        assert query["pickup[latitude]"] == ["51.5007"]
        assert query["pickup[longitude]"] == ["-0.1246"]
        assert query["pickup[nickname]"] == ["Central London"]
        assert query["dropoff[latitude]"] == ["51.5074"]
        assert query["dropoff[longitude]"] == ["-0.1278"]
        assert query["dropoff[nickname]"] == ["Paddington"]
        assert query["action"] == ["setPickup"]
        assert "pickup" not in query


def test_get_auth_url_route_returns_unavailable(monkeypatch):
    """Deep-link-only implementation: auth-url always returns available=False."""
    app.dependency_overrides[get_current_customer] = lambda: {"id": "cust-1"}
    try:
        response = TestClient(app).get("/uber/auth-url")
    finally:
        app.dependency_overrides.pop(get_current_customer, None)

    assert response.status_code == 200
    body = response.json()
    assert body["available"] is False
    assert body["auth_url"] is None
    assert isinstance(body["message"], str)


def test_get_deeplink_route_returns_url_for_owned_event(monkeypatch):
    monkeypatch.setenv("UBER_CLIENT_ID", "test-client-id")
    from app.config import get_settings
    get_settings.cache_clear()

    monkeypatch.setattr(
        uber_router,
        "get_owned_calendar_event",
        lambda event_id, customer_id: {
            "id": event_id,
            "origin": "London Heathrow (LHR)",
            "destination": "Tokyo Narita (NRT)",
        },
    )
    app.dependency_overrides[get_current_customer] = lambda: {"id": "cust-1"}
    try:
        response = TestClient(app).get("/uber/deeplink", params={"calendar_event_id": "evt-1"})
    finally:
        app.dependency_overrides.pop(get_current_customer, None)

    assert response.status_code == 200
    body = response.json()
    assert body["destination_label"] == "London Heathrow (LHR)"
    assert body["airport_options"] == []
    assert body["uber_app_url"].startswith("uber://?")
    assert "action=setPickup" in body["uber_app_url"]
    assert "pickup=my_location" in body["uber_app_url"]
    assert "London" in body["uber_app_url"] or "LHR" in body["uber_app_url"]
    assert "Tokyo" not in body["uber_app_url"] and "NRT" not in body["uber_app_url"]
    assert body["deep_link_url"].startswith("https://m.uber.com/ul/?")


def test_get_deeplink_route_uses_device_pickup_coordinates_when_provided(monkeypatch):
    monkeypatch.setenv("UBER_CLIENT_ID", "test-client-id")
    from app.config import get_settings
    get_settings.cache_clear()

    monkeypatch.setattr(
        uber_router,
        "get_owned_calendar_event",
        lambda event_id, customer_id: {
            "id": event_id,
            "origin": "London Heathrow (LHR)",
            "destination": "Tokyo Narita (NRT)",
        },
    )
    app.dependency_overrides[get_current_customer] = lambda: {"id": "cust-1"}
    try:
        response = TestClient(app).get(
            "/uber/deeplink",
            params={
                "calendar_event_id": "evt-1",
                "pickup_latitude": 51.5007,
                "pickup_longitude": -0.1246,
                "pickup_label": "Central London",
            },
        )
    finally:
        app.dependency_overrides.pop(get_current_customer, None)

    assert response.status_code == 200
    body = response.json()
    for url in (body["uber_app_url"], body["deep_link_url"]):
        query = parse_qs(urlparse(url).query)
        assert query["pickup[latitude]"] == ["51.5007"]
        assert query["pickup[longitude]"] == ["-0.1246"]
        assert query["pickup[nickname]"] == ["Central London"]
        assert query["dropoff[nickname]"] == ["London Heathrow (LHR)"]
        assert "pickup" not in query


def test_get_deeplink_route_returns_airport_options_for_city_origin(monkeypatch):
    monkeypatch.setenv("UBER_CLIENT_ID", "test-client-id")
    from app.config import get_settings
    get_settings.cache_clear()

    monkeypatch.setattr(
        uber_router,
        "get_owned_calendar_event",
        lambda event_id, customer_id: {
            "id": event_id,
            "origin": "London",
            "destination": "Tokyo Narita (NRT)",
        },
    )
    app.dependency_overrides[get_current_customer] = lambda: {"id": "cust-1"}
    try:
        response = TestClient(app).get("/uber/deeplink", params={"calendar_event_id": "evt-2"})
    finally:
        app.dependency_overrides.pop(get_current_customer, None)

    assert response.status_code == 200
    body = response.json()
    assert body["destination_label"] == "London"
    assert body["uber_app_url"] is None
    assert body["deep_link_url"] is None
    assert [opt["label"] for opt in body["airport_options"]] == [
        "London Heathrow (LHR)",
        "London Gatwick (LGW)",
    ]
    for opt in body["airport_options"]:
        assert opt["uber_app_url"].startswith("uber://?")
        assert opt["deep_link_url"].startswith("https://m.uber.com/ul/?")
        assert "pickup=my_location" in opt["uber_app_url"]
