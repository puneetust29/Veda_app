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

    url = build_uber_deeplink()

    parsed = urlparse(url)
    assert parsed.netloc == "m.uber.com"
    assert parsed.path == "/ul/"
    query = parse_qs(parsed.query)
    assert query["client_id"] == ["test-client-id"]
    assert query["pickup"] == ["my_location"]
    assert "dropoff[latitude]" not in url


def test_build_uber_deeplink_includes_dropoff_when_coordinates_given(monkeypatch):
    monkeypatch.setenv("UBER_CLIENT_ID", "test-client-id")
    from app.config import get_settings

    get_settings.cache_clear()

    url = build_uber_deeplink(dropoff_latitude=51.5074, dropoff_longitude=-0.1278, dropoff_nickname="Central London")

    query = parse_qs(urlparse(url).query)
    assert query["dropoff[latitude]"] == ["51.5074"]
    assert query["dropoff[longitude]"] == ["-0.1278"]
    assert query["dropoff[nickname]"] == ["Central London"]


def test_get_deeplink_route_returns_url_for_owned_event(monkeypatch):
    monkeypatch.setenv("UBER_CLIENT_ID", "test-client-id")
    from app.config import get_settings

    get_settings.cache_clear()

    monkeypatch.setattr(
        uber_router,
        "get_owned_calendar_event",
        lambda event_id, customer_id: {"id": event_id, "destination": "Tokyo Narita (NRT)"},
    )
    app.dependency_overrides[get_current_customer] = lambda: {"id": "cust-1"}
    try:
        client = TestClient(app)
        response = client.get("/uber/deeplink", params={"calendar_event_id": "evt-1"})
    finally:
        app.dependency_overrides.pop(get_current_customer, None)

    assert response.status_code == 200
    body = response.json()
    assert body["destination_label"] == "Tokyo Narita (NRT)"
    assert body["deep_link_url"].startswith("https://m.uber.com/ul/?")
