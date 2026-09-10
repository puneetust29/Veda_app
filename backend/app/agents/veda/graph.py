import logging

from langchain_anthropic import ChatAnthropic
from langgraph.graph import END, StateGraph
from langgraph.types import StreamWriter

from app.agents.veda.prompts import veda_prompt
from app.agents.veda.schemas import VedaReply
from app.agents.veda.state import VedaAgentState
from app.config import get_settings

logger = logging.getLogger(__name__)


def _llm():
    settings = get_settings()
    if settings.anthropic_api_key:
        return ChatAnthropic(model=settings.anthropic_model, api_key=settings.anthropic_api_key)
    raise RuntimeError("No LLM key configured — set ANTHROPIC_API_KEY in backend/.env")


def node_veda_reply(state: VedaAgentState, writer: StreamWriter) -> dict:
    llm = _llm().with_structured_output(VedaReply)

    location_context = state.get("location_context")
    enriched_location_context = state.get("enriched_location_context")
    logger.info("[veda/graph] location_context=%r enriched=%s", location_context, bool(enriched_location_context))

    prompt = veda_prompt(
        user_message=state.get("user_message", ""),
        history=state.get("history", []),
        location_context=location_context,
        enriched_location_context=enriched_location_context,
    )

    verdict = llm.invoke(prompt)

    writer({"kind": "text", "role": "agent", "text": verdict.reply})

    if verdict.share_text:
        writer({"kind": "share_draft", "text": verdict.share_text})

    if verdict.location_action:
        writer({"kind": "location_action", "payload": verdict.location_action.model_dump()})

    return {
        "reply": verdict.reply,
        "share_text": verdict.share_text,
        "on_topic": verdict.on_topic,
        "location_action": verdict.location_action.model_dump() if verdict.location_action else None,
    }


def build_veda_graph():
    graph = StateGraph(VedaAgentState)
    graph.add_node("veda_reply", node_veda_reply)
    graph.set_entry_point("veda_reply")
    graph.add_edge("veda_reply", END)
    return graph.compile()


veda_graph = build_veda_graph()
