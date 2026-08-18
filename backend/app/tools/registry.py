"""ToolRegistry: a name -> ToolSpec lookup used by manifest validation and (later) by
agents to call out to product/backend APIs through a declared, risk-tagged surface.

This pass is validation/lookup only -- no call interception, retry, or caching yet
(that's explicitly out of scope, see the plan's reconciliation notes).
"""
from __future__ import annotations

import dataclasses
from typing import Any, Callable, Dict, Optional


@dataclasses.dataclass
class ToolSpec:
    name: str
    handler: Callable[..., Any]
    risk: str  # RiskTier ("read" | "draft" | "commit"), kept as str to avoid a
    # policy <-> tools import cycle; validated against policy.risk.RiskTier at the
    # registry validation layer, not here.
    provider: str = ""


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: Dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> None:
        self._tools[spec.name] = spec

    def get(self, name: str) -> Optional[ToolSpec]:
        return self._tools.get(name)

    def __contains__(self, name: str) -> bool:
        return name in self._tools

    def all(self) -> Dict[str, ToolSpec]:
        return dict(self._tools)


# Module-level singleton -- concrete tool modules (e.g. app/tools/mobile.py) register
# their callables here at import time.
tool_registry = ToolRegistry()
