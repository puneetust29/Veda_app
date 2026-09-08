"""Orchestrator: Ingest -> Match -> Plan -> Dispatch -> Collect.

No concrete agent name may ever appear in this module (see
tests/test_no_agent_imports.py) -- everything here is generic over whatever the
AgentRegistry has discovered and validated.
"""
from __future__ import annotations

import logging
import uuid
from functools import lru_cache
from typing import Callable, List, Optional

logger = logging.getLogger(__name__)

from app.agents.base.contracts import AgentContext, AgentResult
from app.context.resolver import ContextResolver, get_context_resolver
from app.orchestration.intents import OrchestratorRequest, OrchestratorResult
from app.orchestration.registry import AgentRegistry, get_registry
from app.policy import risk as policy


def _noop_emit(_event: dict) -> None:
    return None


class Orchestrator:
    def __init__(self, registry: AgentRegistry, context_resolver: ContextResolver) -> None:
        self._registry = registry
        self._context_resolver = context_resolver

    def _match_with_resolved_context(self, request: OrchestratorRequest) -> tuple:
        """Coarse filter, resolve the union of matched agents' required_context, then
        refine by triggers.rules against that resolved context. Returns
        (matched_agents, resolved_context)."""
        coarse = self._registry.match(request.intent)

        required_keys: set = set()
        for entry in coarse:
            required_keys.update(entry.manifest.required_context)
        resolved_context = self._context_resolver.resolve(
            required_keys, request.principal, request.subject
        )

        matched = self._registry.match(request.intent, context=resolved_context)
        matched.sort(key=lambda entry: entry.manifest.priority)
        return matched, resolved_context

    def run(
        self,
        request: OrchestratorRequest,
        emit: Optional[Callable[[dict], None]] = None,
    ) -> OrchestratorResult:
        emit = emit or _noop_emit
        run_id = str(uuid.uuid4())

        matched, resolved_context = self._match_with_resolved_context(request)
        agent_names = [e.manifest.name for e in matched]
        logger.info("[orchestrator] run_id=%s matched_agents=%s", run_id, agent_names)
        emit({"type": "run_started", "data": {"run_id": run_id, "agents": agent_names}})

        results: List[AgentResult] = []
        for entry in matched:
            logger.info("[orchestrator] dispatching agent=%s", entry.manifest.name)
            ctx_slice = {k: resolved_context.get(k) for k in entry.manifest.required_context}
            agent_ctx = AgentContext(
                run_id=run_id,
                principal=request.principal,
                context=ctx_slice,
                conversation_id=request.conversation_id,
                subject=request.subject,
                mode=request.mode,
                emit=emit,
                user_message=request.user_message,
            )
            agent_crashed = False
            try:
                result = entry.agent.execute(agent_ctx, request.mode)
                logger.info("[orchestrator] agent=%s status=%s summary=%s", entry.manifest.name, result.status, result.summary)
            except Exception as exc:  # one agent's failure never aborts the run
                logger.exception("[orchestrator] agent=%s crashed: %s", entry.manifest.name, exc)
                agent_crashed = True
                import traceback
                print(f"[AGENT ERROR] {entry.manifest.name}: {exc}")
                print(traceback.format_exc())
                result = AgentResult(
                    agent=entry.manifest.name,
                    version=entry.manifest.version,
                    status="failed",
                    error=str(exc),
                )
            results.append(result)

            # A well-behaved agent always emits its own terminal `done` event (with
            # agent-specific status semantics) before execute() returns. That only
            # happens on the agent's normal control-flow paths though, so if it raised
            # instead, emit a generic fallback here to guarantee the stream still
            # terminates with error+done.
            if agent_crashed:
                emit({"type": "error", "data": {"code": "agent_error", "retryable": False}})
                emit({"type": "done", "data": {"status": "failed"}})

            for action in result.proposed_actions:
                action_name = action.get("name")
                if action_name:
                    policy.evaluate(
                        entry.manifest,
                        action_name,
                        action.get("params", {}),
                        request.principal,
                        approved=False,
                    )

        if not matched:
            # No agent matched this run at all (e.g. no trigger rule applied) -- still
            # guarantee the stream terminates with an event rather than just closing.
            emit({"type": "error", "data": {"code": "no_agent_matched", "retryable": False}})
            emit({"type": "done", "data": {"status": "ok_no_action"}})

        return OrchestratorResult(run_id=run_id, results=results)

    def execute_action(
        self,
        request: OrchestratorRequest,
        action_name: str,
        params: dict,
        emit: Optional[Callable[[dict], None]] = None,
    ) -> AgentResult:
        """Used by the (formalized) activate/subscribe path: re-resolve context, run
        the manifest-declared risk check with `approved=True` (the caller's explicit
        confirmation *is* the approval), then run the agent's action."""
        emit = emit or _noop_emit
        run_id = str(uuid.uuid4())

        matched, resolved_context = self._match_with_resolved_context(request)
        if not matched:
            raise LookupError("no agent matched this request")
        entry = matched[0]

        decision = policy.evaluate(entry.manifest, action_name, params, request.principal, approved=True)
        if not decision.allowed:
            return AgentResult(
                agent=entry.manifest.name,
                version=entry.manifest.version,
                status="failed",
                error=decision.reason or "policy denied this action",
            )

        ctx_slice = {k: resolved_context.get(k) for k in entry.manifest.required_context}
        ctx_slice.update(params)
        agent_ctx = AgentContext(
            run_id=run_id,
            principal=request.principal,
            context=ctx_slice,
            conversation_id=request.conversation_id,
            subject=request.subject,
            mode=request.mode,
            emit=emit,
            user_message=request.user_message,
        )
        return entry.agent.execute_action(agent_ctx, action_name)


@lru_cache
def get_orchestrator() -> Orchestrator:
    return Orchestrator(get_registry(), get_context_resolver())
