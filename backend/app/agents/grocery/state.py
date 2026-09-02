from typing import Optional

from app.agents.base.state import AgentState


class GroceryAgentState(AgentState, total=False):
    customer: dict
    user_message: str
    history: list[dict]

    # Intent extraction outputs
    items: list[str]
    supermarket_domain: str
    supermarket_name: str
    reply: str
    supermarket_mentioned: bool

    # Basket outputs
    card: dict
