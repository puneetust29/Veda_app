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

    # uber:// scheme
    assert uber_app_url.startswith("uber://?")
    app_query = parse_qs(urlparse(uber_app_url).query)
    assert app_query["client_id"] == ["test-client-id"]
    assert app_query["action"] == ["setPickup"]
    assert app_query["pickup"] == ["my_location"]
    assert "dropoff[latitude]" not in uber_app_url

    # web fallback
    parsed = urlparse(web_fallback_url)
    assert parsed.netloc == "m.uber.com"
    assert parsed.path == "/ul/"
    web_query = parse_qs(parsed.query)
    assert web_query["action"] == ["setPickup"]
    assert web_query["pickup"] == ["my_location"]


def test_build_uber_deeplink_includes_dropoff_when_coordinates_given(monkeypatch):
    monkeypatch.setenv("UBER_CLIENT_ID", "test-client-id")
    from app.config import get_settings

    get_settings.cache_clear()

    uber_app_url, web_fallback_url = build_uber_deeplink(
        dropoff_latitude=51.5074, dropoff_longitude=-0.1278, dropoff_nickname="Central London"
    )

    for url in (uber_app_url, web_fallback_url):
        query = parse_qs(urlparse(url).query)
        assert query["dropoff[latitude]"] == ["51.5074"]
        assert query["dropoff[longitude]"] == ["-0.1278"]
        assert query["dropoff[nickname]"] == ["Central London"]
        assert query["action"] == ["setPickup"]


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
        client = TestClient(app)
        response = client.get("/uber/deeplink", params={"calendar_event_id": "evt-1"})
    finally:
        app.dependency_overrides.pop(get_current_customer, None)

    assert response.status_code == 200
    body = response.json()
    assert body["destination_label"] == "Tokyo Narita (NRT)"

    # uber:// scheme URL
    assert body["uber_app_url"].startswith("uber://?")
    assert "action=setPickup" in body["uber_app_url"]
    assert "London" in body["uber_app_url"] or "LHR" in body["uber_app_url"]
    assert "Tokyo" in body["uber_app_url"] or "NRT" in body["uber_app_url"]

    # web fallback URL
    assert body["deep_link_url"].startswith("https://m.uber.com/ul/?")
    assert "action=setPickup" in body["deep_link_url"]
    assert "London" in body["deep_link_url"] or "LHR" in body["deep_link_url"]
    assert "Tokyo" in body["deep_link_url"] or "NRT" in body["deep_link_url"]
