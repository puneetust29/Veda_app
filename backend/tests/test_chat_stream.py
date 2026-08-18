"""Verifies POST /chat/stream without a real Anthropic key: the route is registered,
auth is enforced, a bad calendar_event_id 404s, SSE headers are correct, and (with the
LLM monkeypatched the same way test_agent_graph.py does) the ordered event-type
sequence runs through recommendation_ready/confirmation_required/done.
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from jose import jwt

from app.agents.roaming import graph as graph_module
from app.agents.roaming.schemas import JudgeVerdict, PlanRecommendation
from app.config import get_settings
from app.main import app

CUSTOMER_ROW = {"id": "cust-1", "phone_number": "+15550001111"}
EVENT_ROW = {
    "id": "evt-1",
    "customer_id": "cust-1",
    "event_type": "flight",
    "start_datetime": "2026-09-01T10:00:00+00:00",
    "end_datetime": "2026-09-08T10:00:00+00:00",
    "raw_details": {"destination_country": "Japan"},
    "title": "Flight to Japan",
    "origin": "FRA",
    "destination": "NRT",
}
CATALOG = [
    {
        "id": "plan-7d",
        "country_name": "Japan",
        "duration_days": 7,
        "data_gb": 5,
        "price": 25.0,
        "currency": "EUR",
        "plan_name": "7-day Japan",
    }
]


class _FakeQuery:
    def __init__(self, table: str):
        self.table = table
        self._filters: dict = {}

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    def order(self, *_args):
        return self

    def limit(self, *_args):
        return self

    def execute(self):
        if self.table == "calendar_events":
            if self._filters.get("id") == EVENT_ROW["id"] and self._filters.get("customer_id") == "cust-1":
                return SimpleNamespace(data=[EVENT_ROW])
            return SimpleNamespace(data=[])
        if self.table == "customers":
            return SimpleNamespace(data=[CUSTOMER_ROW])
        return SimpleNamespace(data=[])


class _FakeSupabase:
    def table(self, name):
        return _FakeQuery(name)


class _FakeStructuredLLM:
    def __init__(self, model_cls, recommend_responses, judge_responses):
        self._model_cls = model_cls
        self._recommend_responses = recommend_responses
        self._judge_responses = judge_responses

    def invoke(self, _prompt):
        if self._model_cls is PlanRecommendation:
            return self._recommend_responses.pop(0)
        return self._judge_responses.pop(0)


class _FakeLLM:
    def __init__(self, recommend_responses, judge_responses):
        self._recommend_responses = recommend_responses
        self._judge_responses = judge_responses

    def with_structured_output(self, model_cls):
        return _FakeStructuredLLM(model_cls, self._recommend_responses, self._judge_responses)


@pytest.fixture
def auth_token():
    settings = get_settings()
    return jwt.encode(
        {"phone": CUSTOMER_ROW["phone_number"], "aud": "authenticated"},
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )


@pytest.fixture
def fake_supabase(monkeypatch):
    import app.deps as deps_module
    import app.routers._shared as shared_module

    fake = _FakeSupabase()
    monkeypatch.setattr(deps_module, "get_supabase", lambda: fake)
    monkeypatch.setattr(shared_module, "get_supabase", lambda: fake)
    return fake


@pytest.fixture
def approving_llm(monkeypatch):
    recommend_responses = [PlanRecommendation(plan_id="plan-7d", reasoning="Matches the 7-day trip")]
    judge_responses = [JudgeVerdict(approved=True, feedback="Duration and data allowance both fit")]
    monkeypatch.setattr(graph_module, "_llm", lambda: _FakeLLM(recommend_responses, judge_responses))
    monkeypatch.setattr(graph_module, "fetch_roaming_catalog", lambda _country: CATALOG)


def test_chat_stream_requires_auth(fake_supabase):
    with TestClient(app) as client:
        response = client.post("/chat/stream", json={"calendar_event_id": "evt-1"})
    assert response.status_code == 401 or response.status_code == 403


def test_chat_stream_404s_on_unowned_or_missing_event(fake_supabase, auth_token):
    with TestClient(app) as client:
        response = client.post(
            "/chat/stream",
            json={"calendar_event_id": "does-not-exist"},
            headers={"Authorization": f"Bearer {auth_token}"},
        )
    assert response.status_code == 404


def test_chat_stream_headers(fake_supabase, approving_llm, auth_token):
    with TestClient(app) as client:
        with client.stream(
            "POST",
            "/chat/stream",
            json={"calendar_event_id": "evt-1"},
            headers={"Authorization": f"Bearer {auth_token}"},
        ) as response:
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")
            assert response.headers["cache-control"] == "no-cache"
            assert response.headers["connection"] == "keep-alive"
            assert response.headers["x-accel-buffering"] == "no"
            # Drain the stream so the background task completes before the test exits.
            for _ in response.iter_lines():
                pass


def test_chat_stream_event_sequence(fake_supabase, approving_llm, auth_token):
    with TestClient(app) as client:
        with client.stream(
            "POST",
            "/chat/stream",
            json={"calendar_event_id": "evt-1"},
            headers={"Authorization": f"Bearer {auth_token}"},
        ) as response:
            event_types = [
                line[len("event: "):] for line in response.iter_lines() if line.startswith("event: ")
            ]

    assert event_types[0] == "run_started"
    assert "recommendation_ready" in event_types
    assert "confirmation_required" in event_types
    assert event_types[-1] == "done"
    assert event_types.count("done") == 1

    # recommendation_ready must come before confirmation_required, which must come
    # before the final done -- the stream closes right after these per the plan.
    assert (
        event_types.index("recommendation_ready")
        < event_types.index("confirmation_required")
        < event_types.index("done")
    )
