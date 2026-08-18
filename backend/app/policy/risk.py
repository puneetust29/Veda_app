"""Policy engine, deliberately simplified: manifest-declared risk tiers + a spend-limit
guard. No HMAC signing, no signed ProposedAction token machinery -- that solves a safe
async-resumption problem that doesn't exist yet without a checkpointer (see the plan's
reconciliation table). The caller's second explicit call to a commit-risk action (e.g.
tapping "Activate" on a pending confirmation) *is* the approval.
"""
from __future__ import annotations

import dataclasses
from typing import TYPE_CHECKING, Literal

from app.config import get_settings

if TYPE_CHECKING:
    from app.agents.base.manifest import AgentManifest

RiskTier = Literal["read", "draft", "commit"]


@dataclasses.dataclass
class PolicyDecision:
    allowed: bool
    requires_approval: bool = False
    reason: str = ""


def _deny(reason: str) -> PolicyDecision:
    return PolicyDecision(allowed=False, requires_approval=False, reason=reason)


def _allow(requires_approval: bool = False, reason: str = "") -> PolicyDecision:
    return PolicyDecision(allowed=True, requires_approval=requires_approval, reason=reason)


def evaluate(
    manifest: "AgentManifest",
    action_name: str,
    params: dict,
    principal: dict,
    approved: bool = False,
) -> PolicyDecision:
    spec = manifest.action(action_name)
    if spec is None:
        return _deny("undeclared action")

    if spec.risk == "read":
        return _allow()

    if spec.risk == "draft":
        return _allow(requires_approval=False)

    if spec.risk == "commit":
        settings = get_settings()
        price = params.get("price", 0) or 0
        if price > settings.max_commit_amount_eur:
            return _deny("exceeds spend limit")
        return PolicyDecision(
            allowed=approved,
            requires_approval=True,
            reason="" if approved else "commit action requires explicit approval",
        )

    return _deny(f"unknown risk tier '{spec.risk}'")
