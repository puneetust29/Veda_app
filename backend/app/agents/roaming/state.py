from typing import Optional

from app.agents.base.state import AgentState


class RoamingAgentState(AgentState, total=False):
    """Extends the shared AgentState (run_id, customer_id, conversation_id, mode,
    context, status, error) *and* keeps its existing flat keys the graph's nodes already
    read/write. RoamingAgent._initial_state() writes the resolved context into both
    `state["context"]` (the contract) and these flat keys (no node rewrites needed) --
    a deliberate small duplication, not a design flaw; collapse once/if a checkpointer
    with a single shared state shape lands.
    """

    customer: dict
    calendar_event: dict

    destination_country: str
    trip_duration_days: int
    trip_details: Optional[dict]
    is_home_country: bool

    roaming_catalog: list[dict]

    candidate_plan: Optional[dict]
    reasoning: str

    judge_approved: bool
    judge_feedback: str
    retry_count: int

    subscription_result: Optional[dict]

    # Follow-up chat fields
    user_message: Optional[str]
    prior_candidate_plan: Optional[dict]
    prior_reasoning: str
    prior_judge_feedback: str
    followup_route: Optional[str]
    followup_reply: str
