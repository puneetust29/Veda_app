from typing import Optional

from app.agents.base.state import AgentState


class VedaAgentState(AgentState, total=False):
    """Veda agent state: customer context + message + conversation history."""

    customer: dict
    user_message: str
    history: list[dict]

    reply: str
    share_text: Optional[str]
    on_topic: bool
