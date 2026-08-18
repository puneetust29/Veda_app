"""Shared AgentState: the 7 keys every agent's LangGraph state extends.

Concrete agents (e.g. RoamingAgentState) subclass this TypedDict *and* keep their own
flat domain keys -- see app/agents/roaming/state.py for the documented reasoning.
"""
from typing import Optional, TypedDict


class AgentState(TypedDict, total=False):
    run_id: str
    customer_id: str
    conversation_id: Optional[str]
    mode: str
    context: dict
    status: str
    error: Optional[str]
