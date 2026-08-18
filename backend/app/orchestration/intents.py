"""Orchestrator-facing request/result shapes. These stay agent-agnostic -- no concrete
agent name may ever appear in this module (enforced by tests/test_no_agent_imports.py).
"""
from __future__ import annotations

import dataclasses
from typing import List, Optional

from app.agents.base.contracts import AgentMode, AgentResult


@dataclasses.dataclass
class Intent:
    """What triggered this orchestrator run.

    `event` mirrors a future event-bus's event name (e.g. "trip.detected"); when both
    `capability` and `event` are None, the orchestrator matches every enabled agent --
    which is what the chat endpoint does today, until a real event system exists
    upstream of it.
    """

    event: Optional[str] = None
    capability: Optional[str] = None


@dataclasses.dataclass
class OrchestratorRequest:
    principal: dict
    subject: dict = dataclasses.field(default_factory=dict)
    intent: Intent = dataclasses.field(default_factory=Intent)
    conversation_id: Optional[str] = None
    mode: AgentMode = "suggest"
    user_message: Optional[str] = None


@dataclasses.dataclass
class OrchestratorResult:
    run_id: str
    results: List[AgentResult] = dataclasses.field(default_factory=list)
