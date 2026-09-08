"""VedaAgent: general-purpose travel & Veda app assistant."""
from __future__ import annotations

import asyncio
import pathlib

from app.agents.base.contracts import AgentContext, AgentMode, AgentResult, BaseAgent
from app.agents.base.manifest import load_manifest
from app.agents.base.runner import run_graph_streaming
from app.agents.veda.graph import veda_graph
from app.agents.veda.stream_map import build_done, build_error, translate

_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"


class VedaAgent(BaseAgent):
    def __init__(self) -> None:
        self.manifest = load_manifest(_MANIFEST_PATH)

    def _initial_state(self, ctx: AgentContext) -> dict:
        customer = ctx.context.get("customer")
        return {
            "run_id": ctx.run_id,
            "customer_id": (customer or {}).get("id"),
            "conversation_id": ctx.conversation_id,
            "mode": ctx.mode,
            "context": ctx.context,
            "customer": customer,
            "user_message": ctx.user_message,
            "history": (ctx.subject or {}).get("history", []),
        }

    def execute(self, ctx: AgentContext, mode: AgentMode = "suggest") -> AgentResult:
        state = self._initial_state(ctx)

        if mode == "converse":
            def _forward_translated(payload: dict) -> None:
                for event in translate("custom", payload):
                    ctx.emit(event)

            # Run graph in a worker thread so blocking Anthropic calls don't freeze the event loop
            final_state = asyncio.run(run_graph_streaming(veda_graph, state, _forward_translated))
        else:
            final_state = veda_graph.invoke(state)

        reply = final_state.get("reply", "")
        ctx.emit(build_done("ok_no_action"))

        return AgentResult(
            agent=self.manifest.name,
            version=self.manifest.version,
            status="ok",
            summary=reply,
            raw=final_state,
        )


AGENT = VedaAgent()
