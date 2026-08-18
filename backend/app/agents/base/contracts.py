"""The Agent contract: the minimal interface every agent under app/agents/<name>/ implements.

Kept as plain dataclasses (not pydantic models) because these are in-process call
arguments/return values, not wire boundaries -- AgentContext in particular carries a
live `emit` callable that pydantic has no reason to validate.
"""
from __future__ import annotations

import dataclasses
from typing import Any, Callable, List, Literal, Optional, Protocol, runtime_checkable

AgentMode = Literal["suggest", "converse"]


def _default_emit(_event: dict) -> None:
    """No-op emit used when an agent runs outside a streaming context (legacy routes)."""
    return None


@dataclasses.dataclass
class AgentContext:
    run_id: str
    principal: dict
    context: dict
    conversation_id: Optional[str] = None
    subject: Optional[dict] = None
    mode: AgentMode = "suggest"
    emit: Callable[[dict], None] = _default_emit
    user_message: Optional[str] = None


@dataclasses.dataclass
class AgentResult:
    agent: str
    version: str
    status: Literal["ok", "failed", "awaiting_approval"]
    summary: str = ""
    cards: List[dict] = dataclasses.field(default_factory=list)
    proposed_actions: List[dict] = dataclasses.field(default_factory=list)
    raw: dict = dataclasses.field(default_factory=dict)
    error: Optional[str] = None


class UnsupportedActionError(NotImplementedError):
    """Raised by BaseAgent.execute_action when an agent declares no commit-risk action."""


@runtime_checkable
class Agent(Protocol):
    manifest: Any

    def execute(self, ctx: AgentContext, mode: AgentMode = "suggest") -> AgentResult:
        ...

    def execute_action(self, ctx: AgentContext, action: str) -> AgentResult:
        ...


class BaseAgent:
    """Convenience base class implementing the Agent protocol's optional parts."""

    manifest: Any = None

    def execute(self, ctx: AgentContext, mode: AgentMode = "suggest") -> AgentResult:
        raise NotImplementedError

    def execute_action(self, ctx: AgentContext, action: str) -> AgentResult:
        raise UnsupportedActionError(
            f"{type(self).__name__} does not support action '{action}'"
        )
