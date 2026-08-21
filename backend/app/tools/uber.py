"""Uber tool registrations for the ToolRegistry.

Registers `uber.get_deeplink` (risk: read) so the uber_agent manifest can declare it
and AgentRegistry.validate() can confirm it exists at startup.

The actual deep link logic lives in uber_deeplink.py — this module is purely the
registry bridge, mirroring the pattern in tools/mobile.py for roaming tools.

No commit-risk actions are registered here because deep links require no server-side
booking call — the user completes the ride request inside their own Uber app.
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
