from langgraph.graph import END, StateGraph
from langgraph.types import StreamWriter

from app.agents.veda.prompts import veda_prompt
from app.agents.veda.schemas import VedaReply
from app.agents.veda.state import VedaAgentState
from app.llm.factory import get_chat_model


def _llm():
    # Module-level seam: tests monkeypatch this symbol.
    return get_chat_model()


def node_veda_reply(state: VedaAgentState, writer: StreamWriter) -> dict:
    llm = _llm().with_structured_output(VedaReply)

    location_context = state.get("location_context")
    enriched_location_context = state.get("enriched_location_context")

    prompt = veda_prompt(
        user_message=state.get("user_message", ""),
        history=state.get("history", []),
        location_context=location_context,
        enriched_location_context=enriched_location_context,
    )

    verdict = llm.invoke(prompt)

    # Always emit the reply
    writer({"kind": "text", "role": "agent", "text": verdict.reply})

    # If a share_text was drafted, emit it as a share_draft event
    if verdict.share_text:
        writer({"kind": "share_draft", "text": verdict.share_text})

    if verdict.location_action:
        writer({"kind": "location_action", "payload": verdict.location_action.model_dump()})

    return {
        "reply": verdict.reply,
        "share_text": verdict.share_text,
        "on_topic": verdict.on_topic,
    }


def build_veda_graph():
    """Single-node graph: extract message -> reply."""
    graph = StateGraph(VedaAgentState)
    graph.add_node("veda_reply", node_veda_reply)
    graph.set_entry_point("veda_reply")
    graph.add_edge("veda_reply", END)
    return graph.compile()


veda_graph = build_veda_graph()
