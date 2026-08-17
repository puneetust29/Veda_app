from langchain_anthropic import ChatAnthropic
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field

from app.agent.state import RoamingAgentState
from app.agent.tools import extract_trip_context, fetch_roaming_catalog, subscribe_roaming_plan
from app.config import get_settings

MAX_RETRIES = 2


class PlanRecommendation(BaseModel):
    plan_id: str = Field(description="id of the chosen roaming_plans row")
    reasoning: str = Field(description="why this plan fits the trip")


class JudgeVerdict(BaseModel):
    approved: bool
    feedback: str = Field(description="why approved, or what is wrong if rejected")


def _llm():
    settings = get_settings()
    return ChatAnthropic(
        model=settings.anthropic_model,
        api_key=settings.anthropic_api_key,
        temperature=0,
    )


def node_extract_trip_context(state: RoamingAgentState) -> dict:
    country, days = extract_trip_context(state["calendar_event"])
    return {"destination_country": country, "trip_duration_days": days}


def node_fetch_catalog(state: RoamingAgentState) -> dict:
    catalog = fetch_roaming_catalog(state["destination_country"])
    return {"roaming_catalog": catalog}


def node_recommend_plan(state: RoamingAgentState) -> dict:
    llm = _llm().with_structured_output(PlanRecommendation)

    feedback_note = ""
    if state.get("judge_feedback"):
        feedback_note = (
            f"\n\nYour previous recommendation was rejected: {state['judge_feedback']}. "
            "Pick a different, better-fitting plan."
        )

    prompt = (
        "You are a telecom roaming plan advisor. A customer is travelling to "
        f"{state['destination_country']} for {state['trip_duration_days']} days.\n\n"
        f"Available roaming plans (JSON):\n{state['roaming_catalog']}\n\n"
        "Pick the single best-fitting plan id for this trip, balancing data allowance "
        "vs. trip length vs. price. Prefer a plan whose duration_days covers the whole "
        "trip without being wastefully long, and enough data_gb for typical use."
        f"{feedback_note}"
    )

    result = llm.invoke(prompt)
    chosen = next((p for p in state["roaming_catalog"] if p["id"] == result.plan_id), None)
    return {"candidate_plan": chosen, "reasoning": result.reasoning}


def node_judge(state: RoamingAgentState) -> dict:
    llm = _llm().with_structured_output(JudgeVerdict)

    prompt = (
        "You are reviewing a roaming-plan recommendation before it is subscribed on a "
        "customer's behalf.\n\n"
        f"Trip: {state['trip_duration_days']} days to {state['destination_country']}.\n"
        f"Recommended plan: {state['candidate_plan']}\n"
        f"Advisor's reasoning: {state['reasoning']}\n\n"
        "Approve only if the plan's duration_days covers the trip length and the data "
        "allowance is reasonable for the trip length. Reject with clear feedback otherwise."
    )

    verdict = llm.invoke(prompt)
    return {
        "judge_approved": verdict.approved,
        "judge_feedback": verdict.feedback,
        "retry_count": state.get("retry_count", 0) + (0 if verdict.approved else 1),
    }


def route_after_judge(state: RoamingAgentState) -> str:
    if state.get("judge_approved"):
        return "approved"
    if state.get("retry_count", 0) >= MAX_RETRIES:
        return "give_up"
    return "retry"


def node_subscribe(state: RoamingAgentState) -> dict:
    result = subscribe_roaming_plan(
        customer_id=state["customer"]["id"],
        roaming_plan_id=state["candidate_plan"]["id"],
        calendar_event_id=state["calendar_event"]["id"],
        agent_reasoning={
            "reasoning": state["reasoning"],
            "judge_feedback": state["judge_feedback"],
        },
    )
    return {"subscription_result": result}


def build_recommend_graph():
    """Steps 1-4: extract trip context -> fetch catalog -> recommend -> judge (with retry)."""
    graph = StateGraph(RoamingAgentState)
    graph.add_node("extract_trip_context", node_extract_trip_context)
    graph.add_node("fetch_catalog", node_fetch_catalog)
    graph.add_node("recommend_plan", node_recommend_plan)
    graph.add_node("judge", node_judge)

    graph.set_entry_point("extract_trip_context")
    graph.add_edge("extract_trip_context", "fetch_catalog")
    graph.add_edge("fetch_catalog", "recommend_plan")
    graph.add_edge("recommend_plan", "judge")
    graph.add_conditional_edges(
        "judge",
        route_after_judge,
        {"approved": END, "retry": "recommend_plan", "give_up": END},
    )
    return graph.compile()


def build_subscribe_graph():
    """Step 5: subscribe the already-judged plan."""
    graph = StateGraph(RoamingAgentState)
    graph.add_node("subscribe_plan", node_subscribe)
    graph.set_entry_point("subscribe_plan")
    graph.add_edge("subscribe_plan", END)
    return graph.compile()


recommend_graph = build_recommend_graph()
subscribe_graph = build_subscribe_graph()
