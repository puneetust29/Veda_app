from app.agents.base.manifest import ActionSpec, AgentManifest, TriggerSpec
from app.config import get_settings
from app.policy import risk as policy


def _manifest(**overrides) -> AgentManifest:
    base = dict(
        name="fake_agent",
        version="0.1.0",
        description="test agent",
        enabled=True,
        priority=0,
        capabilities=["roaming"],
        triggers=TriggerSpec(),
        required_context=[],
        tools=["mobile.read_tool", "mobile.commit_tool", "mobile.draft_tool"],
        actions=[
            ActionSpec(name="read_thing", risk="read", tool="mobile.read_tool"),
            ActionSpec(name="draft_thing", risk="draft", tool="mobile.draft_tool"),
            ActionSpec(name="commit_thing", risk="commit", tool="mobile.commit_tool"),
        ],
        output_schema=None,
    )
    base.update(overrides)
    return AgentManifest(**base)


def test_undeclared_action_is_denied():
    manifest = _manifest()
    decision = policy.evaluate(manifest, "no_such_action", {}, principal={"id": "c1"})
    assert decision.allowed is False
    assert "undeclared" in decision.reason


def test_read_action_is_always_allowed():
    manifest = _manifest()
    decision = policy.evaluate(manifest, "read_thing", {}, principal={"id": "c1"})
    assert decision.allowed is True
    assert decision.requires_approval is False


def test_draft_action_is_allowed_without_approval():
    manifest = _manifest()
    decision = policy.evaluate(manifest, "draft_thing", {}, principal={"id": "c1"})
    assert decision.allowed is True
    assert decision.requires_approval is False


def test_commit_action_without_approval_is_denied():
    manifest = _manifest()
    decision = policy.evaluate(
        manifest, "commit_thing", {"price": 10.0}, principal={"id": "c1"}, approved=False
    )
    assert decision.allowed is False
    assert decision.requires_approval is True


def test_commit_action_with_approval_is_allowed():
    manifest = _manifest()
    decision = policy.evaluate(
        manifest, "commit_thing", {"price": 10.0}, principal={"id": "c1"}, approved=True
    )
    assert decision.allowed is True
    assert decision.requires_approval is True


def test_commit_action_over_spend_limit_is_denied_even_if_approved():
    manifest = _manifest()
    settings = get_settings()
    over_limit_price = settings.max_commit_amount_eur + 1

    decision = policy.evaluate(
        manifest,
        "commit_thing",
        {"price": over_limit_price},
        principal={"id": "c1"},
        approved=True,
    )
    assert decision.allowed is False
    assert "spend limit" in decision.reason


def test_commit_action_missing_price_defaults_to_zero_and_is_allowed():
    manifest = _manifest()
    decision = policy.evaluate(manifest, "commit_thing", {}, principal={"id": "c1"}, approved=True)
    assert decision.allowed is True
