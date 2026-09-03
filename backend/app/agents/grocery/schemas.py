from typing import Literal, Optional
from pydantic import BaseModel, Field


class GroceryIntent(BaseModel):
    items: list[str] = Field(description="List of grocery items the user wants, e.g. ['milk', 'eggs', 'bread']")
    supermarket: str = Field(
        description="Supermarket domain to use. UK options: tesco.com, sainsburys.co.uk, asda.com, waitrose.com, groceries.morrisons.com. Default to tesco.com if not specified.",
        default="tesco.com",
    )
    supermarket_name: str = Field(description="Human-readable supermarket name, e.g. 'Tesco'", default="Tesco")
    reply_to_user: str = Field(description="Short friendly confirmation message to show the user before building the basket")


class GroceryProduct(BaseModel):
    item_name: str
    product_name: str
    price: int  # in smallest currency unit (pence/cents)
    currency: str = "GBP"
    image_url: Optional[str] = None
    session_token: Optional[str] = None
    num_units: int = 1

    @property
    def price_formatted(self) -> str:
        if self.currency == "GBP":
            return f"£{self.price / 100:.2f}"
        return f"{self.price / 100:.2f} {self.currency}"


class GroceryBasket(BaseModel):
    supermarket_domain: str
    supermarket_name: str
    items: list[GroceryProduct] = Field(default_factory=list)
    missing_items: list[str] = Field(default_factory=list)
    currency: str = "GBP"
    checkout_url: Optional[str] = None  # predirect or session redirect URL

    @property
    def total_pence(self) -> int:
        return sum(p.price * p.num_units for p in self.items)

    @property
    def total_formatted(self) -> str:
        total = self.total_pence
        if self.currency == "GBP":
            return f"£{total / 100:.2f}"
        return f"{total / 100:.2f} {self.currency}"


class GroceryResultCard(BaseModel):
    kind: Literal["grocery_basket"] = "grocery_basket"
    supermarket: str
    supermarket_name: str
    items: list[dict] = Field(default_factory=list)
    missing_items: list[str] = Field(default_factory=list)
    total_formatted: Optional[str] = None
    checkout_url: str
    checkout_mode: Literal["predirect", "products", "oneshot", "automated"] = "predirect"
    message: str = ""
    # Present when checkout_mode == "automated": SKUs for the auto-checkout endpoint
    auto_checkout_skus: Optional[list[dict]] = None
