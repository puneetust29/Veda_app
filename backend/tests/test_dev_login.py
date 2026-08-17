from fastapi.testclient import TestClient
from jose import jwt

from app.config import get_settings
from app.main import app
from app.routers import auth as auth_router


def test_dev_login_issues_a_token_the_normal_auth_dependency_accepts(monkeypatch):
    monkeypatch.setattr(auth_router, "get_or_create_customer", lambda phone: {"id": "cust-1", "phone_number": phone})

    client = TestClient(app)
    response = client.post("/auth/dev-login", json={"phone_number": "+15550001111"})

    assert response.status_code == 200
    body = response.json()
    assert body["customer"]["phone_number"] == "+15550001111"

    settings = get_settings()
    payload = jwt.decode(
        body["access_token"], settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated"
    )
    assert payload["phone"] == "+15550001111"


def test_dev_login_disabled_in_production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()

    client = TestClient(app)
    response = client.post("/auth/dev-login", json={"phone_number": "+15550001111"})

    assert response.status_code == 404
