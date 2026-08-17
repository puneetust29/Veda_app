from app.agent import graph as graph_module
from app.agent.graph import PlanRecommendation, JudgeVerdict, recommend_graph, subscribe_graph

CALENDAR_EVENT = {
    "id": "evt-1",
    "customer_id": "cust-1",
    "start_datetime": "2026-09-01T10:00:00+00:00",
    "end_datetime": "2026-09-08T10:00:00+00:00",
    "raw_details": {"destination_country": "Japan"},
}
CUSTOMER = {"id": "cust-1", "phone_number": "+15550001111"}
CATALOG = [
    {"id": "plan-7d", "country_name": "Japan", "duration_days": 7, "data_gb": 5, "price": 25.0},
    {"id": "plan-14d", "country_name": "Japan", "duration_days": 14, "data_gb": 12, "price": 42.0},
    {"id": "plan-30d", "country_name": "Japan", "duration_days": 30, "data_gb": 25, "price": 75.0},
]


class FakeStructuredLLM:
    def __init__(self, model_cls, recommend_responses, judge_responses):
        self._model_cls = model_cls
        self._recommend_responses = recommend_responses
        self._judge_responses = judge_responses

    def invoke(self, _prompt):
        if self._model_cls is PlanRecommendation:
            return self._recommend_responses.pop(0)
        return self._judge_responses.pop(0)


class FakeLLM:
    def __init__(self, recommend_responses, judge_responses):
        self._recommend_responses = recommend_responses
        self._judge_responses = judge_responses

    def with_structured_output(self, model_cls):
        return FakeStructuredLLM(model_cls, self._recommend_responses, self._judge_responses)


def _patch_agent(monkeypatch, recommend_responses, judge_responses, catalog=CATALOG):
    monkeypatch.setattr(graph_module, "_llm", lambda: FakeLLM(recommend_responses, judge_responses))
    monkeypatch.setattr(graph_module, "fetch_roaming_catalog", lambda _country: catalog)


def test_recommend_graph_approves_on_first_try(monkeypatch):
    _patch_agent(
        monkeypatch,
        recommend_responses=[PlanRecommendation(plan_id="plan-7d", reasoning="Matches the 7-day trip")],
        judge_responses=[JudgeVerdict(approved=True, feedback="Duration and data allowance both fit")],
    )

    final_state = recommend_graph.invoke({"customer": CUSTOMER, "calendar_event": CALENDAR_EVENT})

    assert final_state["destination_country"] == "Japan"
    assert final_state["trip_duration_days"] == 7
    assert final_state["candidate_plan"]["id"] == "plan-7d"
    assert final_state["judge_approved"] is True
    assert final_state.get("retry_count", 0) == 0


def test_recommend_graph_retries_after_judge_rejection(monkeypatch):
    _patch_agent(
        monkeypatch,
        recommend_responses=[
            PlanRecommendation(plan_id="plan-30d", reasoning="Picked the biggest plan"),
            PlanRecommendation(plan_id="plan-7d", reasoning="A closer fit for a 7-day trip"),
        ],
        judge_responses=[
            JudgeVerdict(approved=False, feedback="30 days is wasteful for a 7-day trip"),
            JudgeVerdict(approved=True, feedback="7-day plan matches the trip length"),
        ],
    )

    final_state = recommend_graph.invoke({"customer": CUSTOMER, "calendar_event": CALENDAR_EVENT})

    assert final_state["candidate_plan"]["id"] == "plan-7d"
    assert final_state["judge_approved"] is True
    assert final_state["retry_count"] == 1


def test_recommend_graph_gives_up_after_max_retries(monkeypatch):
    _patch_agent(
        monkeypatch,
        recommend_responses=[
            PlanRecommendation(plan_id="plan-30d", reasoning="attempt 1"),
            PlanRecommendation(plan_id="plan-30d", reasoning="attempt 2"),
            PlanRecommendation(plan_id="plan-30d", reasoning="attempt 3"),
        ],
        judge_responses=[
            JudgeVerdict(approved=False, feedback="still wrong"),
            JudgeVerdict(approved=False, feedback="still wrong"),
            JudgeVerdict(approved=False, feedback="still wrong"),
        ],
    )

    final_state = recommend_graph.invoke({"customer": CUSTOMER, "calendar_event": CALENDAR_EVENT})

    assert final_state["judge_approved"] is False
    assert final_state["retry_count"] == graph_module.MAX_RETRIES


def test_subscribe_graph_calls_subscribe_with_reasoning(monkeypatch):
    captured = {}

    def fake_subscribe(customer_id, roaming_plan_id, calendar_event_id, agent_reasoning):
        captured.update(
            customer_id=customer_id,
            roaming_plan_id=roaming_plan_id,
            calendar_event_id=calendar_event_id,
            agent_reasoning=agent_reasoning,
        )
        return {"id": "sub-1", "status": "active"}

    monkeypatch.setattr(graph_module, "subscribe_roaming_plan", fake_subscribe)

    final_state = subscribe_graph.invoke(
        {
            "customer": CUSTOMER,
            "calendar_event": CALENDAR_EVENT,
            "candidate_plan": {"id": "plan-7d"},
            "reasoning": "Matches the 7-day trip",
            "judge_feedback": "Approved",
        }
    )

    assert final_state["subscription_result"] == {"id": "sub-1", "status": "active"}
    assert captured["customer_id"] == "cust-1"
    assert captured["roaming_plan_id"] == "plan-7d"
    assert captured["calendar_event_id"] == "evt-1"
