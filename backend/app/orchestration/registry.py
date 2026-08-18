"""AgentRegistry: discovers agents by package introspection (never a hardcoded import
list), validates every manifest at startup (raise, don't skip), and matches manifests
against an Intent + resolved context.

No concrete agent name ever appears in this module's logic -- discovery is entirely by
`pkgutil.iter_modules` over `app.agents`. This is the property
tests/test_no_agent_imports.py exists to guard: adding agent #2 is "new folder +
manifest", zero changes here.
"""
from __future__ import annotations

import dataclasses
import importlib
import pkgutil
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

import app.agents as agents_package
from app.agents.base.manifest import AgentManifest, RuleSpec, load_manifest, risk_at_least
from app.context.resolver import ContextResolver, get_context_resolver
from app.orchestration.intents import Intent
from app.tools.registry import ToolRegistry, tool_registry

_OPS = {
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
    "gt": lambda a, b: a > b,
    "gte": lambda a, b: a >= b,
    "lt": lambda a, b: a < b,
    "lte": lambda a, b: a <= b,
    "in": lambda a, b: a in b,
}


def _dotted_get(data: dict, dotted_key: str):
    value: Any = data
    for part in dotted_key.split("."):
        if not isinstance(value, dict) or part not in value:
            return None, False
        value = value[part]
    return value, True


def _rule_matches(rule: RuleSpec, context: dict) -> bool:
    value, found = _dotted_get(context, rule.key)
    if not found:
        return False
    op = _OPS.get(rule.op)
    if op is None:
        raise ValueError(f"unknown rule operator '{rule.op}'")
    try:
        return bool(op(value, rule.value))
    except TypeError:
        return False


def _import_output_schema(dotted_path: str) -> None:
    module_path, _, attr = dotted_path.partition(":")
    if not attr:
        raise ValueError(f"output_schema '{dotted_path}' must be 'module.path:Attr'")
    module = importlib.import_module(module_path)
    schema_cls = getattr(module, attr)
    if not (isinstance(schema_cls, type) and issubclass(schema_cls, BaseModel)):
        raise ValueError(f"output_schema '{dotted_path}' does not import as a pydantic BaseModel")


@dataclasses.dataclass
class RegisteredAgent:
    agent: Any  # the module-level AGENT singleton, satisfying the Agent protocol
    manifest: AgentManifest


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: Dict[str, RegisteredAgent] = {}

    def register(self, agent: Any, manifest: AgentManifest) -> None:
        self._agents[manifest.name] = RegisteredAgent(agent=agent, manifest=manifest)

    def get(self, name: str) -> RegisteredAgent:
        return self._agents[name]

    def all(self) -> List[RegisteredAgent]:
        return list(self._agents.values())

    def discover(self) -> None:
        """pkgutil-discover every subpackage of app.agents (skipping `base` and any
        `_`-prefixed package), import its `agent` module, and register the module-level
        `AGENT` singleton + its manifest.yaml."""
        for module_info in pkgutil.iter_modules(agents_package.__path__):
            name = module_info.name
            if name == "base" or name.startswith("_"):
                continue
            agent_module = importlib.import_module(f"app.agents.{name}.agent")
            agent = getattr(agent_module, "AGENT")
            manifest_path = Path(agent_module.__file__).parent / "manifest.yaml"
            manifest = load_manifest(manifest_path)
            self.register(agent, manifest)

    def validate(self, tools: ToolRegistry, context_resolver: ContextResolver) -> None:
        """Startup validation: raise (don't skip) on any inconsistency."""
        seen_names = set()
        for entry in self._agents.values():
            manifest = entry.manifest

            if manifest.name in seen_names:
                raise ValueError(f"duplicate agent manifest name '{manifest.name}'")
            seen_names.add(manifest.name)

            agent_manifest = getattr(entry.agent, "manifest", None)
            if agent_manifest is None or agent_manifest.name != manifest.name:
                raise ValueError(
                    f"agent for manifest '{manifest.name}' has a mismatched agent.manifest.name"
                )

            for tool_name in manifest.tools:
                if tool_name not in tools:
                    raise ValueError(
                        f"manifest '{manifest.name}' declares unregistered tool '{tool_name}'"
                    )

            for key in manifest.required_context:
                if not context_resolver.has(key):
                    raise ValueError(
                        f"manifest '{manifest.name}' requires context '{key}' with no registered resolver"
                    )

            for action in manifest.actions:
                tool_spec = tools.get(action.tool)
                if tool_spec is None:
                    raise ValueError(
                        f"manifest '{manifest.name}' action '{action.name}' references "
                        f"unregistered tool '{action.tool}'"
                    )
                if not risk_at_least(tool_spec.risk, action.risk):
                    raise ValueError(
                        f"manifest '{manifest.name}' action '{action.name}' declares risk "
                        f"'{action.risk}' higher than its tool's risk '{tool_spec.risk}'"
                    )

            if manifest.output_schema:
                _import_output_schema(manifest.output_schema)

    def match(self, intent: Intent, context: Optional[dict] = None) -> List[RegisteredAgent]:
        """Coarse filter by capabilities/triggers.events (match ALL enabled agents if
        the intent has neither) -> refine by evaluating triggers.rules against
        `context` (a dotted-key lookup, e.g. "calendar_event.event_type" ->
        context["calendar_event"]["event_type"])."""
        candidates: List[RegisteredAgent] = []
        for entry in self._agents.values():
            manifest = entry.manifest
            if not manifest.enabled:
                continue
            if intent.capability is None and intent.event is None:
                candidates.append(entry)
            elif intent.capability is not None and intent.capability in manifest.capabilities:
                candidates.append(entry)
            elif intent.event is not None and intent.event in manifest.triggers.events:
                candidates.append(entry)

        if context is None:
            return candidates

        refined = []
        for entry in candidates:
            rules = entry.manifest.triggers.rules
            if not rules or all(_rule_matches(rule, context) for rule in rules):
                refined.append(entry)
        return refined


@lru_cache
def get_registry() -> AgentRegistry:
    registry = AgentRegistry()
    registry.discover()
    registry.validate(tool_registry, get_context_resolver())
    return registry
