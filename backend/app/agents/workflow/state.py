from typing import Optional

from app.agents.base.state import AgentState


class WorkflowAgentState(AgentState, total=False):
    """Workflow state that orchestrates roaming → insurance agents.

    Extends AgentState (run_id, customer_id, conversation_id, mode, context, status, error)
    and tracks workflow progress and sub-agent states.
    """

    # Workflow progress tracking
    current_step: str  # "load_details" | "roaming" | "insurance" | "complete"
    completed_steps: list[str]  # List of completed step names
    all_steps: list[str]  # All steps in the workflow

    # Flight information (populated in load_details step)
    customer: dict
    calendar_event: dict

    # Roaming sub-agent state (carried forward from roaming agent)
    destination_country: Optional[str]
    trip_duration_days: Optional[int]
    trip_details: Optional[dict]
    roaming_plan_selected: bool
    roaming_candidate_plan: Optional[dict]
    roaming_reasoning: str
    roaming_judge_approved: bool

    # Insurance sub-agent state (carried forward from insurance agent)
    insurance_plan_selected: bool
    insurance_candidate_plan: Optional[dict]

    # Sub-agent execution flags
    skip_roaming: bool  # Skip roaming if user already has it
    skip_insurance: bool  # Skip insurance if user already has it
