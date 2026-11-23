# agent.py and manifest.yaml -- Code Summary

**Files:**
- `backend/app/agents/browser/agent.py` (~30 lines)
- `backend/app/agents/browser/manifest.yaml` (~8 lines)

**Purpose:** Registration stubs so the Veda orchestrator discovers the browser agent at boot time.

---

## Why These Files Exist

When the backend starts, the orchestrator scans every folder inside `app/agents/`.
For each folder, it:

1. Reads `manifest.yaml` -- the agent's registration card
2. Imports `agent.py` -- expects to find an `AGENT` variable
3. Validates the manifest (name, capabilities, required context)
4. Registers the agent so it can be matched to incoming requests

If either file is missing, the backend crashes at startup.

---

## manifest.yaml

```yaml
name: browser_agent
version: 0.1.0
description: AI browser agent that navigates real websites on behalf of the user
enabled: true
priority: 25
capabilities: [browser]
required_context: [customer]
```

| Field | Value | Meaning |
|---|---|---|
| `name` | `browser_agent` | Unique ID in the agent registry |
| `version` | `0.1.0` | For tracking changes |
| `enabled` | `true` | Orchestrator loads it at boot |
| `priority` | `25` | Lower = runs first when multiple agents match (roaming is 10, uber is 20) |
| `capabilities` | `[browser]` | What kind of tasks this agent handles |
| `required_context` | `[customer]` | Only needs an authenticated user (no calendar event, no location) |

Compare with other agents:

| Agent | Priority | Capabilities | Required Context |
|---|---|---|---|
| roaming_agent | 10 | [roaming] | [customer, calendar_event] |
| uber_agent | 20 | [uber] | [customer, calendar_event, device_location] |
| browser_agent | 25 | [browser] | [customer] |
| veda_agent | 100 | [general_assistant] | [customer] |

---

## agent.py

```python
class BrowserAgent(BaseAgent):
    def __init__(self):
        self.manifest = load_manifest("manifest.yaml")

    def execute(self, ctx, mode="suggest"):
        return AgentResult(
            agent=self.manifest.name,
            version=self.manifest.version,
            status="ok",
            summary="Browser agent ready. Use POST /browser/task.",
        )

AGENT = BrowserAgent()
```

This is a **stub**. The `execute()` method returns a placeholder response because
browser tasks do not go through the orchestrator's normal dispatch path.

### Why not use the orchestrator?

The orchestrator runs agents synchronously in one request-response cycle. Browser
tasks need:
- SSE streaming (status updates as Claude works)
- Persistent sessions (browser stays open between messages)
- Background threading (CDP calls block)

These requirements don't fit the orchestrator's pattern. So browser tasks go
directly to `POST /browser/task` (the router), bypassing the orchestrator entirely.

The agent.py and manifest.yaml exist only so the orchestrator doesn't crash at
boot when it scans `app/agents/browser/`.

---

## __init__.py

Empty file. Makes `app/agents/browser/` a Python package so imports work:
```python
from app.agents.browser.driver import VedaBrowserDriver
```
