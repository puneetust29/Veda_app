"""AgentManifest: the single source of truth for what an agent declares about itself
(name, triggers, required context, tools, actions/risk). No `can_handle()` method is
ever added to an agent class -- the manifest is the only thing the registry consults,
so routing logic can never drift between two places.
"""
from __future__ import annotations

import dataclasses
from pathlib import Path
from typing import Any, List, Literal, Optional, Union

import yaml

RiskTier = Literal["read", "draft", "commit"]

_RISK_ORDER = {"read": 0, "draft": 1, "commit": 2}


def risk_at_least(risk: RiskTier, floor: RiskTier) -> bool:
    return _RISK_ORDER[risk] >= _RISK_ORDER[floor]


@dataclasses.dataclass
class RuleSpec:
    key: str
    op: str
    value: Any


@dataclasses.dataclass
class TriggerSpec:
    events: List[str] = dataclasses.field(default_factory=list)
    rules: List[RuleSpec] = dataclasses.field(default_factory=list)


@dataclasses.dataclass
class ActionSpec:
    name: str
    risk: RiskTier
    tool: str
    approval: str = "required"
    idempotent: bool = False


@dataclasses.dataclass
class AgentManifest:
    name: str
    version: str
    description: str
    enabled: bool
    priority: int
    capabilities: List[str]
    triggers: TriggerSpec
    required_context: List[str]
    tools: List[str]
    actions: List[ActionSpec]
    output_schema: Optional[str] = None

    def action(self, name: str) -> Optional[ActionSpec]:
        return next((a for a in self.actions if a.name == name), None)


def load_manifest(path: Union[str, Path]) -> AgentManifest:
    path = Path(path)
    raw = yaml.safe_load(path.read_text()) or {}

    try:
        name = raw["name"]
    except KeyError as exc:
        raise ValueError(f"manifest at {path} is missing required key 'name'") from exc

    triggers_raw = raw.get("triggers") or {}
    rules = [RuleSpec(**rule) for rule in (triggers_raw.get("rules") or [])]
    triggers = TriggerSpec(events=list(triggers_raw.get("events") or []), rules=rules)

    actions = [ActionSpec(**action) for action in (raw.get("actions") or [])]

    return AgentManifest(
        name=name,
        version=raw.get("version", "0.0.0"),
        description=raw.get("description", ""),
        enabled=bool(raw.get("enabled", True)),
        priority=int(raw.get("priority", 0)),
        capabilities=list(raw.get("capabilities") or []),
        triggers=triggers,
        required_context=list(raw.get("required_context") or []),
        tools=list(raw.get("tools") or []),
        actions=actions,
        output_schema=raw.get("output_schema"),
    )
