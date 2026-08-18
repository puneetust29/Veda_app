"""Bridges a synchronous, blocking compiled LangGraph into the async FastAPI world.

Why not `.astream()` directly: the roaming graph's nodes make blocking calls
(ChatAnthropic.invoke(), Supabase queries). LangGraph's RunnableCallable.ainvoke()
falls straight through to the sync .invoke() when a node has no async variant
(see langgraph/utils/runnable.py, RunnableCallable.ainvoke: `if not self.afunc:
return self.invoke(input, config)`) -- so `.astream()` would run those blocking calls
inline on the FastAPI event loop, freezing every other concurrent request for the
full LLM latency.

The fix: run the existing sync `graph.stream(state, stream_mode=["updates", "custom"])`
inside `asyncio.to_thread(...)`, and forward each "custom" chunk (the `writer({...})`
calls added to the graph's nodes) through a thread-safe `emit` callback as they arrive.
"""
from __future__ import annotations

import asyncio
from typing import Any, Callable, Optional


async def run_graph_streaming(
    graph: Any,
    state: dict,
    emit: Callable[[dict], None],
    *,
    config: Optional[dict] = None,
) -> dict:
    """Runs `graph` to completion in a worker thread, emitting each custom stream chunk.

    Returns the final merged state (equivalent to what `graph.invoke(state)` would have
    returned) once the underlying graph run completes.
    """

    def _drive() -> dict:
        final_state: dict = dict(state)
        for mode, payload in graph.stream(state, config=config, stream_mode=["updates", "custom"]):
            if mode == "custom":
                emit(payload)
            elif mode == "updates":
                # payload is {node_name: node_output_dict}; merge every node's partial
                # state update the same way LangGraph's own reducer would for `total=False`
                # TypedDict state (last writer wins, which matches .invoke()'s behavior here).
                for node_output in payload.values():
                    if isinstance(node_output, dict):
                        final_state.update(node_output)
        return final_state

    return await asyncio.to_thread(_drive)
