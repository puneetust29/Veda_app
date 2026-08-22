"""Uber tool registrations for the ToolRegistry.

Uses official Uber deep-link API for reliable launch into the real Uber app.
No third-party dependencies or API approval required.
"""
from app.tools.registry import ToolSpec, tool_registry
from app.tools.uber_deeplink import build_uber_deeplink

tool_registry.register(
    ToolSpec(
        name="uber.get_deeplink",
        handler=build_uber_deeplink,
        risk="read",
        provider="uber",
    )
)
