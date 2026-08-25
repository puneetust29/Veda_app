"""Travel insurance catalog fetcher (reads from local JSON file via StrapiClient)."""
from app.integrations.strapi import StrapiClient
from app.tools.registry import ToolSpec, tool_registry

_strapi = StrapiClient()


def fetch_insurance_catalog(country: str) -> list[dict]:
    """Fetch travel insurance plans for a given country."""
    plans = _strapi.get_travel_insurance_plans(country=country)
    return [p.model_dump() for p in plans]


tool_registry.register(
    ToolSpec(
        name="insurance.get_plans",
        handler=fetch_insurance_catalog,
        risk="read",
        provider="insurance",
    )
)
