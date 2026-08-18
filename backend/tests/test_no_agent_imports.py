"""The single most important test in this refactor: proves that the generic
orchestration layer (app/orchestration/, app/policy/) and the generic chat route
(app/routers/conversation.py) never reference a concrete agent by name. Adding agent #2
must be "new folder + manifest", zero changes to any of these files.
"""
import pathlib

import pytest

APP_ROOT = pathlib.Path(__file__).resolve().parents[1] / "app"

# The one agent that exists today, named every way it could plausibly leak into
# "generic" code: its module path, its manifest name, and its class name.
FORBIDDEN_SUBSTRINGS = [
    "app.agents.roaming",
    "agents.roaming",
    "roaming_agent",
    "RoamingAgent",
]

GUARDED_PATHS = [
    APP_ROOT / "orchestration",
    APP_ROOT / "policy",
    APP_ROOT / "routers" / "conversation.py",
]


def _guarded_python_files():
    files = []
    for path in GUARDED_PATHS:
        if path.is_file():
            files.append(path)
        elif path.is_dir():
            files.extend(sorted(path.rglob("*.py")))
    return files


@pytest.mark.parametrize(
    "path",
    _guarded_python_files(),
    ids=lambda p: str(p.relative_to(APP_ROOT)),
)
def test_no_concrete_agent_name_referenced(path: pathlib.Path):
    text = path.read_text()
    for forbidden in FORBIDDEN_SUBSTRINGS:
        assert forbidden not in text, (
            f"{path.relative_to(APP_ROOT)} references '{forbidden}' -- "
            "orchestration/policy/conversation must stay agent-agnostic"
        )


def test_guarded_paths_actually_exist():
    """Guards against the parametrized test above silently collecting zero files if a
    path gets renamed/moved -- an empty parametrize list would make this whole test
    module vacuously pass."""
    assert _guarded_python_files(), "no files found under the guarded paths"
