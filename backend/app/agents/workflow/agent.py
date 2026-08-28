"""WorkflowAgent: coordinates roaming and insurance agents in sequence.

For MVP, this agent:
1. Loads flight details
2. Returns control to orchestrator to run roaming agent
3. Orchestrator handles advancing to insurance agent after roaming confirmed

The workflow coordination happens primarily on the mobile side via state tracking.
"""

import pathlib

from app.agents.base.contracts import AgentContext, AgentMode, AgentResult, BaseAgent
from app.agents.base.manifest import load_manifest


_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"


class WorkflowAgent(BaseAgent):
    def __init__(self) -> None:
        self.manifest = load_manifest(_MANIFEST_PATH)

    def execute(self, ctx: AgentContext, mode: AgentMode = "suggest") -> AgentResult:
        """For MVP, workflow agent just returns success with no action.
        The actual roaming/insurance agents handle the work in the orchestrator."""
        return AgentResult(
            agent=self.manifest.name,
            version=self.manifest.version,
            status="ok",
            summary="Ready to start trip preparation.",
        )


AGENT = WorkflowAgent()
