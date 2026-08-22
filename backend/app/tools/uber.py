"""Uber tool registrations for the ToolRegistry.

The Uber agent now uses two integration layers:
- deep-link handoff (`uber.get_deeplink`) for reliable launch into the real Uber app
- MCP-backed read tools (`uber.get_auth_url`, `uber.get_price_estimates`) so the
  agent can surface connect/auth flows and live quote data when available

Commit-risk MCP actions (request/cancel ride) are intentionally deferred until the
product flow, token storage, and explicit approval UX are formalized.
"""
from app.tools.registry import ToolSpec, tool_registry
from app.tools.uber_deeplink import build_uber_deeplink
from app.tools.uber_mcp import get_uber_auth_url, get_uber_price_estimates

tool_registry.register(
    ToolSpec(
        name="uber.get_deeplink",
        handler=build_uber_deeplink,
        risk="read",
        provider="uber",
    )
)

tool_registry.register(
    ToolSpec(
        name="uber.get_auth_url",
        handler=get_uber_auth_url,
        risk="read",
        provider="uber_mcp",
    )
)

tool_registry.register(
    ToolSpec(
        name="uber.get_price_estimates",
        handler=get_uber_price_estimates,
        risk="read",
        provider="uber_mcp",
    )
)
