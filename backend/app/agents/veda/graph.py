from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.types import StreamWriter

from app.agents.veda.prompts import veda_prompt
from app.agents.veda.schemas import VedaReply
from app.agents.veda.state import VedaAgentState
from app.config import get_settings


def _llm():
    settings = get_settings()
    if settings.anthropic_api_key:
        return ChatAnthropic(model=settings.anthropic_model, api_key=settings.anthropic_api_key, temperature=0)
    if settings.openai_api_key:
        return ChatOpenAI(model=settings.openai_model, api_key=settings.openai_api_key, temperature=0)
    raise RuntimeError("No LLM key configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY in backend/.env")


def node_veda_reply(state: VedaAgentState, writer: StreamWriter) -> dict:
    llm = _llm().with_structured_output(VedaReply)

    prompt = veda_prompt(
        user_message=state.get("user_message", ""),
        history=state.get("history", []),
    )

    verdict = llm.invoke(prompt)

    # Always emit the reply
    writer({"kind": "text", "role": "agent", "text": verdict.reply})

    # If a share_text was drafted, emit it as a share_draft event
    if verdict.share_text:
        writer({"kind": "share_draft", "text": verdict.share_text})

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
