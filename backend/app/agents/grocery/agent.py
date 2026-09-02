"""GroceryAgent: find products, build a basket, and return a Pepesto checkout link."""
from __future__ import annotations

import asyncio
import logging
import pathlib

from app.agents.base.contracts import AgentContext, AgentMode, AgentResult, BaseAgent
from app.agents.base.manifest import load_manifest
from app.agents.base.runner import run_graph_streaming
from app.agents.grocery.graph import grocery_graph
from app.agents.grocery.stream_map import build_done, build_error, translate

logger = logging.getLogger(__name__)

_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"


class GroceryAgent(BaseAgent):
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

    def execute(self, ctx: AgentContext, mode: AgentMode = "converse") -> AgentResult:
        state = self._initial_state(ctx)
        logger.info("[grocery] execute START | run_id=%s | message=%r", ctx.run_id, (ctx.user_message or "")[:100])

        try:
            def _forward(payload: dict) -> None:
                for event in translate("custom", payload):
                    ctx.emit(event)

            final_state = asyncio.run(run_graph_streaming(grocery_graph, state, _forward))

            card = final_state.get("card", {})
            ctx.emit(build_done("ok"))

            return AgentResult(
                agent=self.manifest.name,
                version=self.manifest.version,
                status="ok",
                summary=f"Grocery basket ready at {card.get('supermarket_name', 'Tesco')}",
                raw=final_state,
            )
        except Exception as e:
            import traceback
            logger.error("[grocery] execute FAILED | run_id=%s | error=%r\n%s", ctx.run_id, e, traceback.format_exc())
            ctx.emit(build_error("grocery_agent_error", message=str(e)))
            ctx.emit(build_done("failed"))
            return AgentResult(
                agent=self.manifest.name,
                version=self.manifest.version,
                status="failed",
                error=str(e),
            )


AGENT = GroceryAgent()
