import pytest

from app.agents.base.manifest import ActionSpec, AgentManifest, RuleSpec, TriggerSpec
from app.context.resolver import ContextResolver
from app.orchestration.intents import Intent
from app.orchestration.registry import AgentRegistry, get_registry
from app.tools.registry import ToolRegistry, ToolSpec


class _FakeAgent:
    def __init__(self, manifest: AgentManifest) -> None:
        self.manifest = manifest


def _manifest(**overrides) -> AgentManifest:
    base = dict(
        name="fake_agent",
        version="0.1.0",
        description="test agent",
        enabled=True,
        priority=0,
        capabilities=["roaming"],
        triggers=TriggerSpec(
            events=["trip.detected"],
            rules=[RuleSpec(key="calendar_event.event_type", op="eq", value="flight")],
        ),
        required_context=["customer"],
        tools=["mobile.get_roaming_plans"],
        actions=[],
        output_schema=None,
    )
    base.update(overrides)
    return AgentManifest(**base)


def test_discovery_finds_the_roaming_agent():
    registry = get_registry()
    names = [entry.manifest.name for entry in registry.all()]
    assert "roaming_agent" in names


def test_validate_raises_on_unregistered_tool():
    registry = AgentRegistry()
    manifest = _manifest(tools=["mobile.not_a_real_tool"], actions=[])
    registry.register(_FakeAgent(manifest), manifest)

    with pytest.raises(ValueError, match="unregistered tool"):
        registry.validate(ToolRegistry(), ContextResolver())


def test_validate_raises_on_missing_context_resolver():
    registry = AgentRegistry()
    manifest = _manifest(tools=[], required_context=["something_unresolvable"])
    registry.register(_FakeAgent(manifest), manifest)

    with pytest.raises(ValueError, match="no registered resolver"):
        registry.validate(ToolRegistry(), ContextResolver())


def test_validate_raises_on_action_referencing_unregistered_tool():
    registry = AgentRegistry()
    manifest = _manifest(
        tools=[],
        actions=[ActionSpec(name="do_thing", risk="commit", tool="mobile.missing_tool")],
    )
    registry.register(_FakeAgent(manifest), manifest)

    with pytest.raises(ValueError, match="unregistered tool"):
        registry.validate(ToolRegistry(), ContextResolver())


def test_validate_raises_when_action_risk_exceeds_tool_risk():
    registry = AgentRegistry()
    manifest = _manifest(
        tools=["mobile.read_tool"],
        actions=[ActionSpec(name="do_thing", risk="commit", tool="mobile.read_tool")],
    )
    registry.register(_FakeAgent(manifest), manifest)

    tools = ToolRegistry()
    tools.register(ToolSpec(name="mobile.read_tool", handler=lambda: None, risk="read"))

    with pytest.raises(ValueError, match="higher than its tool's risk"):
        registry.validate(tools, ContextResolver())


def test_validate_raises_on_duplicate_manifest_name():
    registry = AgentRegistry()
    manifest = _manifest(tools=[])
    registry.register(_FakeAgent(manifest), manifest)
    # Force a duplicate by registering a second entry under the same manifest name
    # (register() keys by manifest.name, so simulate the raw dict having a collision).
    registry._agents["fake_agent_2"] = registry._agents["fake_agent"]
    registry._agents["fake_agent_2"].manifest = _manifest(name="fake_agent", tools=[])

    with pytest.raises(ValueError, match="duplicate agent manifest name"):
        registry.validate(ToolRegistry(), ContextResolver())


def test_validate_raises_when_agent_manifest_name_mismatched():
    registry = AgentRegistry()
    manifest = _manifest(tools=[])
    mismatched_agent = _FakeAgent(_manifest(name="a_different_name", tools=[]))
    registry.register(mismatched_agent, manifest)

    with pytest.raises(ValueError, match="mismatched agent.manifest.name"):
        registry.validate(ToolRegistry(), ContextResolver())


def test_match_by_capability():
    registry = AgentRegistry()
    manifest = _manifest()
    registry.register(_FakeAgent(manifest), manifest)

    assert [e.manifest.name for e in registry.match(Intent(capability="roaming"))] == ["fake_agent"]
    assert registry.match(Intent(capability="travel_pass")) == []


def test_match_by_event():
    registry = AgentRegistry()
    manifest = _manifest()
    registry.register(_FakeAgent(manifest), manifest)

    assert [e.manifest.name for e in registry.match(Intent(event="trip.detected"))] == ["fake_agent"]
    assert registry.match(Intent(event="trip.unrelated")) == []


def test_match_with_no_capability_or_event_matches_all_enabled():
    registry = AgentRegistry()
    manifest = _manifest()
    registry.register(_FakeAgent(manifest), manifest)

    assert [e.manifest.name for e in registry.match(Intent())] == ["fake_agent"]


def test_match_skips_disabled_agents():
    registry = AgentRegistry()
    manifest = _manifest(enabled=False)
    registry.register(_FakeAgent(manifest), manifest)

    assert registry.match(Intent()) == []


def test_match_refines_by_rule_flight_vs_other_event_type():
    registry = AgentRegistry()
    manifest = _manifest()
    registry.register(_FakeAgent(manifest), manifest)

    flight_context = {"calendar_event": {"event_type": "flight"}}
    other_context = {"calendar_event": {"event_type": "other"}}

    assert [e.manifest.name for e in registry.match(Intent(), context=flight_context)] == ["fake_agent"]
    assert registry.match(Intent(), context=other_context) == []
