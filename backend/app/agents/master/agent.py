"""MasterAgent: full-context fallback agent.

Unlike every other agent, this one never competes for a turn via
capabilities/triggers -- `AgentRegistry.match()` skips any manifest with
`fallback: true` (see registry.py), so it can never run alongside another agent on the
same turn. It is only reached via `Orchestrator.run()`'s fallback path, when the normal
match comes back empty. Because it exists to catch whatever nothing else recognized, its
manifest declares the widest `required_context` of any agent, on top of the full raw
`subject` every agent already receives.
"""
from __future__ import annotations

import pathlib
from typing import Optional

from langchain_anthropic import ChatAnthropic

from app.agents.base.contracts import AgentContext, AgentMode, AgentResult, BaseAgent
from app.agents.base.manifest import load_manifest
from app.agents.master.prompts import master_prompt
from app.agents.master.schemas import MasterReply
from app.agents.uber.ride_card import build_ride_card
from app.config import get_settings
from app.context.resolver import get_context_resolver
from app.orchestration.registry import get_registry

_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"


def _llm():
    settings = get_settings()
    if settings.anthropic_api_key:
        return ChatAnthropic(model=settings.anthropic_model, api_key=settings.anthropic_api_key)
    raise RuntimeError("No LLM key configured — set ANTHROPIC_API_KEY in backend/.env")


class MasterAgent(BaseAgent):
    def __init__(self) -> None:
        self.manifest = load_manifest(_MANIFEST_PATH)

    def _delegate_to(self, name: str, ctx: AgentContext, mode: AgentMode) -> AgentResult:
        """Directly invoke another agent's execute(), reusing its own logic/events
        rather than duplicating them here. Looked up by name (not through
        registry.match()), so this reaches agents regardless of `enabled` -- that flag
        still gates the normal capability-matched flow, this is a deliberate hand-off."""
        entry = get_registry().get(name)
        resolved_context = get_context_resolver().resolve(
            set(entry.manifest.required_context), ctx.principal, ctx.subject
        )
        delegate_ctx = AgentContext(
            run_id=ctx.run_id,
            principal=ctx.principal,
            context=resolved_context,
            conversation_id=ctx.conversation_id,
            subject=ctx.subject,
            mode=mode,
            emit=ctx.emit,
            user_message=ctx.user_message,
        )
        return entry.agent.execute(delegate_ctx, mode)

    def _build_ride_card_result(
        self, ctx: AgentContext, pickup_label: Optional[str], dropoff_label: str
    ) -> AgentResult:
        """Build a ride card straight from the pickup/dropoff text the user actually
        typed -- uber_agent's own graph is scoped to the flight's own route, not
        arbitrary point-to-point text (see app.agents.uber.ride_card)."""
        ctx.emit({"type": "tool_started", "data": {"tool": "uber.get_deeplink"}})

        device_location = (ctx.subject or {}).get("device_location")
        card = build_ride_card(pickup_label, dropoff_label, device_location)

        if card is None:
            ctx.emit({"type": "text", "data": {
                "role": "agent",
                "text": f"I couldn't find a location for \"{dropoff_label}\" to set up the ride.",
            }})
            ctx.emit({"type": "done", "data": {"status": "ok_no_action"}})
            return AgentResult(
                agent=self.manifest.name,
                version=self.manifest.version,
                status="failed",
                error="dropoff_not_found",
            )

        ctx.emit({"type": "tool_completed", "data": {"tool": "uber.get_deeplink"}})
        ctx.emit({"type": "recommendation_ready", "data": {"card": card}})
        ctx.emit({"type": "done", "data": {"status": "ok_no_action"}})

        return AgentResult(
            agent="uber_agent",
            version="0.1.0",
            status="ok",
            summary=card["suggested_message"],
            cards=[card],
        )

    def execute(self, ctx: AgentContext, mode: AgentMode = "suggest") -> AgentResult:
        prompt = master_prompt(
            user_message=ctx.user_message or "",
            context=ctx.context,
            subject=ctx.subject or {},
        )
        verdict = _llm().with_structured_output(MasterReply).invoke(prompt)

        if verdict.wants_ride_booking:
            if verdict.dropoff_label:
                return self._build_ride_card_result(ctx, verdict.pickup_label, verdict.dropoff_label)
            return self._delegate_to("uber_agent", ctx, mode)

        # Only ctx.emit(...) reaches the client -- the AgentResult returned below is
        # never sent over the wire (see routers/conversation.py), so the reply itself
        # must be streamed here, not just carried in `summary`.
        ctx.emit({"type": "text", "data": {"role": "agent", "text": verdict.reply}})
        ctx.emit({"type": "done", "data": {"status": "ok_no_action"}})

        return AgentResult(
            agent=self.manifest.name,
            version=self.manifest.version,
            status="ok",
            summary=verdict.reply,
        )


AGENT = MasterAgent()
