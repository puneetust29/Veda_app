from app.agents.base.contracts import AgentContext, AgentResult, BaseAgent
from app.agents.base.manifest import ActionSpec, AgentManifest, TriggerSpec
from app.config import get_settings
from app.context.resolver import ContextResolver
from app.orchestration.intents import Intent, OrchestratorRequest
from app.orchestration.orchestrator import Orchestrator
from app.orchestration.registry import AgentRegistry


def _bare_manifest(name, required_context=None, tools=None, actions=None, priority=0) -> AgentManifest:
    return AgentManifest(
        name=name,
        version="0.1.0",
        description="test agent",
        enabled=True,
        priority=priority,
        capabilities=["roaming"],
        triggers=TriggerSpec(),
        required_context=required_context or [],
        tools=tools or [],
        actions=actions or [],
        output_schema=None,
    )


class _RecordingAgent(BaseAgent):
    def __init__(self, name, required_context=None, priority=0, raises=False):
        self.manifest = _bare_manifest(name, required_context=required_context, priority=priority)
        self.raises = raises
        self.received_context = None

    def execute(self, ctx: AgentContext, mode: str = "suggest") -> AgentResult:
        self.received_context = ctx.context
        if self.raises:
            raise RuntimeError("boom")
        return AgentResult(agent=self.manifest.name, version=self.manifest.version, status="ok", raw={"ok": True})


def _build_orchestrator(*agents):
    registry = AgentRegistry()
    for agent in agents:
        registry.register(agent, agent.manifest)
    return Orchestrator(registry, ContextResolver()), registry


def test_context_is_sliced_to_exactly_required_context():
    agent = _RecordingAgent("slice_agent", required_context=["customer"])
    orchestrator, _ = _build_orchestrator(agent)

    request = OrchestratorRequest(
        principal={"id": "cust-1"},
        subject={"calendar_event": {"id": "evt-1", "event_type": "flight"}},
        intent=Intent(),
    )
    orchestrator.run(request)

    assert agent.received_context == {"customer": {"id": "cust-1"}}
    assert "calendar_event" not in agent.received_context


def test_run_started_is_emitted_first_and_happy_path_synthesizes_no_extra_events():
    agent = _RecordingAgent("event_agent", required_context=["customer"])
    orchestrator, _ = _build_orchestrator(agent)

    events = []
    request = OrchestratorRequest(principal={"id": "cust-1"}, intent=Intent())
    orchestrator.run(request, emit=lambda e: events.append(e["type"]))

    assert events[0] == "run_started"
    # This fake agent doesn't emit anything itself and completes normally, so the
    # orchestrator must not synthesize any further events on the happy path.
    assert events == ["run_started"]


def test_one_failing_agent_does_not_abort_the_run():
    good = _RecordingAgent("good_agent", required_context=["customer"], priority=0)
    bad = _RecordingAgent("bad_agent", required_context=["customer"], priority=1, raises=True)
    orchestrator, _ = _build_orchestrator(good, bad)

    events = []
    request = OrchestratorRequest(principal={"id": "cust-1"}, intent=Intent())
    outcome = orchestrator.run(request, emit=lambda e: events.append(e))

    assert len(outcome.results) == 2
    statuses = {r.agent: r.status for r in outcome.results}
    assert statuses["good_agent"] == "ok"
    assert statuses["bad_agent"] == "failed"

    # The crash triggers the orchestrator's fallback error+done for that agent, since
    # a crashed agent never gets the chance to emit its own terminal event.
    event_types = [e["type"] for e in events]
    assert "error" in event_types
    assert "done" in event_types


def test_agents_dispatch_in_manifest_priority_order():
    order = []

    class _OrderedAgent(BaseAgent):
        def __init__(self, name, priority):
            self.manifest = _bare_manifest(name, priority=priority)

        def execute(self, ctx, mode="suggest"):
            order.append(self.manifest.name)
            return AgentResult(agent=self.manifest.name, version=self.manifest.version, status="ok")

    low_priority = _OrderedAgent("low", priority=10)
    high_priority = _OrderedAgent("high", priority=0)

    orchestrator, _ = _build_orchestrator(low_priority, high_priority)
    orchestrator.run(OrchestratorRequest(principal={"id": "cust-1"}, intent=Intent()))

    assert order == ["high", "low"]


class _ActionAgent(BaseAgent):
    def __init__(self):
        self.manifest = _bare_manifest(
            "action_agent",
            required_context=["customer"],
            tools=["mobile.commit_tool"],
            actions=[ActionSpec(name="do_commit", risk="commit", tool="mobile.commit_tool")],
        )
        self.action_ctx = None
        self.called = False

    def execute(self, ctx, mode="suggest"):
        raise AssertionError("execute() should not be called by execute_action()")

    def execute_action(self, ctx, action):
        self.called = True
        self.action_ctx = ctx
        return AgentResult(agent=self.manifest.name, version=self.manifest.version, status="ok")


def test_execute_action_runs_agent_action_when_policy_allows():
    agent = _ActionAgent()
    orchestrator, _ = _build_orchestrator(agent)

    request = OrchestratorRequest(principal={"id": "cust-1"}, intent=Intent())
    result = orchestrator.execute_action(request, "do_commit", {"price": 5.0})

    assert result.status == "ok"
    assert agent.called is True
    assert agent.action_ctx.context.get("price") == 5.0


def test_execute_action_denied_by_policy_never_calls_the_agent():
    agent = _ActionAgent()
    orchestrator, _ = _build_orchestrator(agent)
    settings = get_settings()

    request = OrchestratorRequest(principal={"id": "cust-1"}, intent=Intent())
    result = orchestrator.execute_action(
        request, "do_commit", {"price": settings.max_commit_amount_eur + 1}
    )

    assert result.status == "failed"
    assert agent.called is False
