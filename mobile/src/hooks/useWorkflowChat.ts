/**
 * Simplified workflow-based chat hook.
 *
 * Linear workflow: Load Details → Roaming Agent → Insurance Agent → Complete
 *
 * Key differences from useRoamingChat:
 * - No view switching (all cards shown in order)
 * - Simple workflow state tracking (currentStep, completedSteps)
 * - Natural chat flow (items appended linearly)
 * - Automatic progression: roaming completion → show insurance
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { applyStreamEvent, nextId } from '../lib/chatThread';
import { api } from '../lib/api';
import type { AgentStreamEvent, CalendarEvent, ChatItem, RoamingPlan } from '../types';

export type ChatPhase = 'idle' | 'streaming' | 'awaiting_confirmation' | 'complete' | 'failed';

export type WorkflowStep = 'roaming' | 'insurance' | 'complete';

export type WorkflowState = {
  currentStep: WorkflowStep;
  completedSteps: WorkflowStep[];
};

type ConfirmationItem = Extract<ChatItem, { kind: 'confirmation' }>;
type CardItem = Extract<ChatItem, { kind: 'card' }>;

const WATCHDOG_MS = 90_000;

function greetingText(event: CalendarEvent): string {
  const date = new Date(event.start_datetime).toLocaleDateString();
  const destination = event.destination ?? 'your destination';
  return `Let me help you get ready for your trip to ${destination} on ${date}.`;
}

export function useWorkflowChat(event: CalendarEvent) {
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    currentStep: 'roaming',
    completedSteps: [],
  });

  const [items, setItems] = useState<ChatItem[]>(() => [
    { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: greetingText(event) },
  ]);
  const [phase, setPhase] = useState<ChatPhase>('idle');

  // Mirrors `items` synchronously so callbacks always read latest state
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const abortControllerRef = useRef<AbortController | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  const lastRequestParamsRef = useRef<{
    message?: string;
    priorPlan?: RoamingPlan;
    priorReasoning?: string;
    priorJudgeFeedback?: string;
  }>({});

  const commitItems = useCallback((next: ChatItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const appendItems = useCallback(
    (newItems: ChatItem[]) => {
      commitItems([...itemsRef.current, ...newItems]);
    },
    [commitItems],
  );

  const updateConfirmationItem = useCallback(
    (actionId: string, patch: Partial<ConfirmationItem>) => {
      commitItems(
        itemsRef.current.map((item) =>
          item.kind === 'confirmation' && item.actionId === actionId ? { ...item, ...patch } : item,
        ),
      );
    },
    [commitItems],
  );

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const pushErrorItem = useCallback(
    (message: string, retryable: boolean) => {
      appendItems([{ id: nextId(), createdAt: Date.now(), kind: 'error', message, retryable }]);
    },
    [appendItems],
  );

  const resetWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogRef.current = setTimeout(() => {
      abortControllerRef.current?.abort();
      pushErrorItem('This is taking longer than expected — the connection timed out.', true);
      setPhase('failed');
    }, WATCHDOG_MS);
  }, [clearWatchdog, pushErrorItem]);

  const handleStreamEvent = useCallback(
    (event_: AgentStreamEvent) => {
      resetWatchdog();
      const next = applyStreamEvent(itemsRef.current, event_);
      commitItems(next);

      switch (event_.type) {
        case 'confirmation_required':
          setPhase('awaiting_confirmation');
          break;
        case 'error':
          setPhase('failed');
          break;
        case 'done': {
          const hasError = next.some((item) => item.kind === 'error');
          const hasPendingConfirmation = next.some(
            (item) => item.kind === 'confirmation' && (item.state === 'pending' || item.state === 'submitting'),
          );
          if (hasError) setPhase('failed');
          else if (hasPendingConfirmation) setPhase('awaiting_confirmation');
          else setPhase('complete');
          break;
        }
        default:
          break;
      }
    },
    [commitItems, resetWatchdog],
  );

  const handleStreamError = useCallback(
    (err: unknown) => {
      clearWatchdog();
      pushErrorItem(err instanceof Error ? err.message : String(err), true);
      setPhase('failed');
    },
    [clearWatchdog, pushErrorItem],
  );

  const startStream = useCallback(
    (
      controller: AbortController,
      params?: {
        message?: string;
        priorPlan?: RoamingPlan;
        priorReasoning?: string;
        priorJudgeFeedback?: string;
      }
    ) => {
      if (params) {
        lastRequestParamsRef.current = params;
      }
      setPhase('streaming');
      resetWatchdog();
      api
        .streamRoamingConversation({
          calendarEventId: event.id,
          signal: controller.signal,
          onEvent: handleStreamEvent,
          onError: (err) => {
            if (controller.signal.aborted) return;
            handleStreamError(err);
          },
          onClose: clearWatchdog,
          ...params,
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          handleStreamError(err);
        });
    },
    [clearWatchdog, event.id, handleStreamError, handleStreamEvent, resetWatchdog],
  );

  // Initialize: check for existing subscriptions
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let cancelled = false;

    (async () => {
      try {
        const [subscriptions, insuranceStatus] = await Promise.all([
          api.listSubscriptions(),
          api.getActiveInsurance(),
        ]);
        if (cancelled) return;

        const existingRoaming = subscriptions.find((s) => s.calendar_event_id === event.id && s.status === 'active');
        const existingInsurance = insuranceStatus.purchases.find(
          (p) => p.calendar_event_id === event.id && p.status === 'active'
        );

        // Both exist: show completion state
        if (existingRoaming && existingInsurance) {
          commitItems([
            { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: '✓ You\'re all set!' },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'receipt',
              subscription: existingRoaming,
              planName: existingRoaming.roaming_plans?.plan_name ?? 'your roaming plan',
            },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'receipt',
              subscription: {
                id: existingInsurance.id,
                status: existingInsurance.status,
                subscribed_at: existingInsurance.purchased_at,
              } as any,
              planName: existingInsurance.plan_details?.planName || 'Travel Insurance',
            },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'text',
              role: 'agent',
              text: 'You have both roaming and travel insurance for this trip.',
            },
          ]);
          setWorkflowState({ currentStep: 'complete', completedSteps: ['roaming', 'insurance'] });
          setPhase('complete');
          return;
        }

        // Only roaming exists: show roaming receipt, then fetch insurance
        if (existingRoaming && !existingInsurance) {
          appendItems([
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'receipt',
              subscription: existingRoaming,
              planName: existingRoaming.roaming_plans?.plan_name ?? 'your roaming plan',
            },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'text',
              role: 'agent',
              text: '✓ Roaming is set up. Now let\'s get you travel insurance.',
            },
          ]);
          setWorkflowState({ currentStep: 'insurance', completedSteps: ['roaming'] });

          // Fetch and show insurance recommendation
          try {
            const plan = await api.getInsuranceRecommendation(event.id);
            if (plan) {
              appendItems([
                {
                  id: nextId(),
                  createdAt: Date.now(),
                  kind: 'travel_insurance',
                  plan: plan,
                  calendarEventId: event.id,
                },
              ]);
            }
          } catch (err) {
            if (__DEV__) console.warn('[useWorkflowChat] Failed to fetch insurance', err);
          }
          setPhase('complete');
          return;
        }

        // Only insurance exists: show insurance receipt, then fetch roaming
        if (!existingRoaming && existingInsurance) {
          appendItems([
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'receipt',
              subscription: {
                id: existingInsurance.id,
                status: existingInsurance.status,
                subscribed_at: existingInsurance.purchased_at,
              } as any,
              planName: existingInsurance.plan_details?.planName || 'Travel Insurance',
            },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'text',
              role: 'agent',
              text: '✓ Travel insurance is ready. Now let\'s get you roaming.',
            },
          ]);
          setWorkflowState({ currentStep: 'roaming', completedSteps: ['insurance'] });
          setPhase('streaming');
          startStream(controller);
          return;
        }

        // Neither exist: start roaming stream
        if (!existingRoaming && !existingInsurance) {
          setPhase('streaming');
          startStream(controller);
          return;
        }
      } catch (err) {
        if (__DEV__) console.warn('[useWorkflowChat] initialization check failed', err);
      }

      if (cancelled) return;
      startStream(controller);
    })();

    return () => {
      cancelled = true;
      clearWatchdog();
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-once
  }, []);

  const confirm = useCallback(
    (actionId: string) => {
      const target = itemsRef.current.find(
        (item): item is ConfirmationItem => item.kind === 'confirmation' && item.actionId === actionId,
      );
      if (!target) return;
      if (target.state !== 'pending' && target.state !== 'failed') return;

      const lastCard = [...itemsRef.current].reverse().find((item): item is CardItem => item.kind === 'card');
      const reasoning = lastCard?.card.kind === 'roaming_plan' ? lastCard.card.reasoning : '';
      const judgeFeedback = lastCard?.card.kind === 'roaming_plan' ? lastCard.card.judge_feedback : '';

      updateConfirmationItem(actionId, { state: 'submitting', error: undefined });

      api
        .subscribeRoaming({
          calendarEventId: target.calendarEventId,
          roamingPlanId: target.planId,
          reasoning,
          judgeFeedback,
        })
        .then((subscription) => {
          updateConfirmationItem(actionId, { state: 'confirmed' });
          appendItems([
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'receipt',
              subscription,
              planName: subscription.roaming_plans?.plan_name ?? target.summary,
            },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'text',
              role: 'agent',
              text: '✓ Roaming is set up. Now let\'s get you travel insurance.',
            },
          ]);

          // Move to insurance step
          setWorkflowState((prev) => ({
            currentStep: 'insurance',
            completedSteps: [...prev.completedSteps, 'roaming'],
          }));

          // Fetch and show insurance recommendation
          api
            .getInsuranceRecommendation(event.id)
            .then((plan) => {
              if (plan) {
                appendItems([
                  {
                    id: nextId(),
                    createdAt: Date.now(),
                    kind: 'travel_insurance',
                    plan: plan,
                    calendarEventId: event.id,
                  },
                ]);
              }
              setPhase('complete');
            })
            .catch((err) => {
              if (__DEV__) console.warn('[useWorkflowChat] Failed to fetch insurance', err);
              setPhase('complete');
            });
        })
        .catch((err) => {
          updateConfirmationItem(actionId, {
            state: 'failed',
            error: err instanceof Error ? err.message : String(err),
          });
        });
    },
    [appendItems, updateConfirmationItem, event.id],
  );

  const decline = useCallback(
    (actionId: string) => {
      const target = itemsRef.current.find(
        (item): item is ConfirmationItem => item.kind === 'confirmation' && item.actionId === actionId,
      );
      if (!target || target.state !== 'pending') return;

      updateConfirmationItem(actionId, { state: 'declined' });

      // Check if this is a roaming plan decline - if so, advance to insurance
      const isRoamingDecline = actionId.startsWith('activate-roaming-');

      if (isRoamingDecline && workflowState.currentStep === 'roaming') {
        // Skip roaming, move to insurance
        appendItems([
          {
            id: nextId(),
            createdAt: Date.now(),
            kind: 'text',
            role: 'agent',
            text: 'No problem. Let\'s make sure you\'re covered with travel insurance for your trip.',
          },
        ]);

        // Update workflow state to insurance
        setWorkflowState((prev) => ({
          currentStep: 'insurance',
          completedSteps: prev.completedSteps, // Don't add 'roaming' - it was skipped, not completed
        }));

        // Fetch and show insurance recommendation
        api
          .getInsuranceRecommendation(event.id)
          .then((plan) => {
            if (plan) {
              appendItems([
                {
                  id: nextId(),
                  createdAt: Date.now(),
                  kind: 'travel_insurance',
                  plan: plan,
                  calendarEventId: event.id,
                },
                {
                  id: nextId(),
                  createdAt: Date.now(),
                  kind: 'text',
                  role: 'agent',
                  text: 'You can always come back to add roaming if you change your mind.',
                },
              ]);
            }
            setPhase('complete');
          })
          .catch((err) => {
            if (__DEV__) console.warn('[useWorkflowChat] Failed to fetch insurance after skipping roaming', err);
            setPhase('complete');
          });
      } else {
        // Generic decline message for non-roaming items
        appendItems([
          {
            id: nextId(),
            createdAt: Date.now(),
            kind: 'text',
            role: 'agent',
            text: 'No problem — let me know if you change your mind.',
          },
        ]);
      }
    },
    [appendItems, updateConfirmationItem, workflowState.currentStep, event.id],
  );

  const handleInsurancePurchased = useCallback(
    (purchaseData: any) => {
      // Check if roaming is already active
      const hasRoamingActive = itemsRef.current.some(
        (item) => item.kind === 'receipt' && 'subscription' in item && item.subscription?.roaming_plans
      );

      const successMessage = hasRoamingActive
        ? '✓ Your travel insurance is now active. You\'re all set for your trip!'
        : '✓ Your travel insurance is now active. You still don\'t have roaming plan. Please check the above plan and activate it now to be ready for your trip.';

      appendItems([
        {
          id: nextId(),
          createdAt: Date.now(),
          kind: 'text',
          role: 'agent',
          text: successMessage,
        },
      ]);

      // Move to complete step
      setWorkflowState((prev) => ({
        currentStep: 'complete',
        completedSteps: Array.from(new Set([...prev.completedSteps, 'insurance'])),
      }));
    },
    [appendItems],
  );

  const retry = useCallback(() => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    startStream(controller, lastRequestParamsRef.current);
  }, [startStream]);

  const sendMessage = useCallback(
    (text: string) => {
      if (phase === 'streaming' || !text.trim()) return;

      appendItems([{ id: nextId(), createdAt: Date.now(), kind: 'text', role: 'user', text }]);

      const lastCard = [...itemsRef.current].reverse().find((item): item is CardItem => item.kind === 'card');
      const priorPlan = lastCard?.card.kind === 'roaming_plan' ? lastCard.card.plan : undefined;
      const priorReasoning = lastCard?.card.kind === 'roaming_plan' ? lastCard.card.reasoning : '';
      const priorJudgeFeedback = lastCard?.card.kind === 'roaming_plan' ? lastCard.card.judge_feedback : '';

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      startStream(controller, {
        message: text,
        priorPlan,
        priorReasoning,
        priorJudgeFeedback,
      });
    },
    [phase, appendItems, startStream],
  );

  return { items, phase, confirm, decline, retry, sendMessage, handleInsurancePurchased, workflowState };
}
