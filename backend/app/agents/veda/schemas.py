from typing import Optional

from pydantic import BaseModel, Field


class VedaReply(BaseModel):
    on_topic: bool = Field(
        description="whether the message is about Veda app features or the customer's travel plans"
    )
    reply: str = Field(
        description="short, friendly natural-language response to show the customer in all cases"
    )
    share_text: Optional[str] = Field(
        default=None,
        description="draft message to send/tell someone (filled only if user message implies messaging someone)",
    )
