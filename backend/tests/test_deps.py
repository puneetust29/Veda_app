from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

from app import deps
from app.config import get_settings


def _credentials_for(payload: dict) -> HTTPAuthorizationCredentials:
    settings = get_settings()
    token = jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_get_current_phone_number_returns_phone_from_valid_token():
    credentials = _credentials_for({"phone": "+15550001111", "aud": "authenticated"})
    assert deps.get_current_phone_number(credentials) == "+15550001111"


def test_get_current_phone_number_rejects_invalid_signature():
    bad_credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="not-a-jwt")
    with pytest.raises(HTTPException) as exc_info:
        deps.get_current_phone_number(bad_credentials)
    assert exc_info.value.status_code == 401


def test_get_current_phone_number_rejects_token_without_phone_claim():
    credentials = _credentials_for({"aud": "authenticated"})
    with pytest.raises(HTTPException) as exc_info:
        deps.get_current_phone_number(credentials)
    assert exc_info.value.status_code == 401


class FakeQuery:
    def __init__(self, store: list[dict]):
        self._store = store
        self._phone_filter = None
        self._insert_payload = None

    def select(self, *_args):
        return self

    def eq(self, column: str, value: str):
        if column == "phone_number":
            self._phone_filter = value
        return self

    def limit(self, *_args):
        return self

    def insert(self, payload: dict):
        self._insert_payload = payload
        return self

    def execute(self):
        if self._insert_payload is not None:
            row = {"id": "new-customer-id", **self._insert_payload}
            self._store.append(row)
            return SimpleNamespace(data=[row])
        matches = [row for row in self._store if row.get("phone_number") == self._phone_filter]
        return SimpleNamespace(data=matches)


class FakeSupabase:
    def __init__(self, initial_rows: list[dict]):
        self.store = initial_rows

    def table(self, _name: str):
        return FakeQuery(self.store)


def test_get_current_customer_returns_existing_profile(monkeypatch):
    existing = {
        "id": "cust-1",
        "phone_number": "+15550001111",
        "full_name": "Alex Morgan",
        "address": "221B Baker Street, London, UK",
        "telecom_plan": "Unlimited Plus",
        "account_number": "ACC-100234",
    }
    monkeypatch.setattr(deps, "get_supabase", lambda: FakeSupabase([existing]))

    customer = deps.get_current_customer(phone_number="+15550001111")

    assert customer == existing


def test_get_current_customer_auto_provisions_new_profile(monkeypatch):
    monkeypatch.setattr(deps, "get_supabase", lambda: FakeSupabase([]))

    customer = deps.get_current_customer(phone_number="+15559998888")

    assert customer["phone_number"] == "+15559998888"
    assert customer["id"] == "new-customer-id"
