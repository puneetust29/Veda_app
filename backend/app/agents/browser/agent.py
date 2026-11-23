"""BrowserAgent: drives a real browser via Claude's Browser Use SDK.

For the MVP, browser tasks are handled directly by the /browser/task SSE
endpoint (routers/browser.py), not through the orchestrator. This agent
stub satisfies the auto-discovery requirement so the app boots.
"""
from __future__ import annotations

import pathlib

from app.agents.base.contracts import AgentContext, AgentMode, AgentResult, BaseAgent
from app.agents.base.manifest import load_manifest

_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"


class BrowserAgent(BaseAgent):
    def __init__(self) -> None:
        self.manifest = load_manifest(_MANIFEST_PATH)

    def execute(self, ctx: AgentContext, mode: AgentMode = "suggest") -> AgentResult:
        """Browser tasks are handled by the dedicated /browser/task SSE endpoint,
        not through the orchestrator's normal dispatch. This is a placeholder."""
        return AgentResult(
            agent=self.manifest.name,
            version=self.manifest.version,
            status="ok",
            summary="Browser agent ready. Use POST /browser/task for browser tasks.",
        )


AGENT = BrowserAgent()
