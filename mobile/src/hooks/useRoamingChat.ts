import { useCallback, useEffect, useRef, useState } from 'react';

import { applyStreamEvent, nextId } from '../lib/chatThread';
import { useSubscriptionInsurance } from '../context/SubscriptionInsuranceContext';
import { api } from '../lib/api';
import type { AgentStreamEvent, CalendarEvent, ChatItem, RoamingPlan } from '../types';

export type ChatPhase = 'idle' | 'streaming' | 'awaiting_confirmation' | 'complete' | 'failed';
export type ViewMode = 'roaming' | 'insurance';
export type PlanState = {
  hasRoaming: boolean;
  hasInsurance: boolean;
  showToggle: boolean;
};

type ConfirmationItem = Extract<ChatItem, { kind: 'confirmation' }>;
type CardItem = Extract<ChatItem, { kind: 'card' }>;

const WATCHDOG_MS = 90_000;

function greetingText(event: CalendarEvent, state: PlanState): string {
  const date = new Date(event.start_datetime).toLocaleDateString();
  const destination = event.destination ?? 'your destination';

  if (state.showToggle) {
    return `Flying to ${destination} on ${date}? You don't have roaming or travel insurance yet. Which would you like to explore first?`;
  } else if (state.hasRoaming && !state.hasInsurance) {
    return `Your roaming is covered. Now, let me make sure you're protected with travel insurance too.`;
  } else if (!state.hasRoaming && state.hasInsurance) {
    return `Your travel insurance is ready. Now let's get you connected with roaming for your trip.`;
  }

  return `Looks like you're flying to ${destination} on ${date}. Let me help you with travel plans…`;
}

export function useRoamingChat(event: CalendarEvent, onInsurancePurchased?: (data: any) => void) {
  const { subscriptions, activeInsurance, refreshSubscriptions, refreshInsurance } = useSubscriptionInsurance();

  const [planState, setPlanState] = useState<PlanState>({ hasRoaming: false, hasInsurance: false, showToggle: false });
  const [currentView, setCurrentView] = useState<ViewMode>('roaming');
  const [cachedInsurancePlan, setCachedInsurancePlan] = useState<any>(null);
  const [initialInsuranceExists, setInitialInsuranceExists] = useState(false);

  const [items, setItems] = useState<ChatItem[]>(() => [
    { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: greetingText(event, { hasRoaming: false, hasInsurance: false, showToggle: false }) },
  ]);
  const [phase, setPhase] = useState<ChatPhase>('idle');

  // Mirrors `items` synchronously so callbacks (stream events, confirm/decline)
  // always read the latest thread state without depending on React's render
  // cycle or re-subscribing effects.
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

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let cancelled = false;

    (async () => {
      try {
        if (cancelled) return;

        const existingInsurance = (activeInsurance?.purchases ?? []).find(
          (p) => p.calendar_event_id === event.id && p.status === 'active'
        );
        const existingRoaming = (subscriptions ?? []).find((s) => s.calendar_event_id === event.id && s.status === 'active');

        // CASE 1: Both roaming AND insurance exist
        if (existingRoaming && existingInsurance) {
          const roamingName = existingRoaming.roaming_plans?.plan_name ?? 'your roaming plan';
          const insuranceDetails = existingInsurance.plan_details || {};
          const insuranceName = insuranceDetails.planName || 'Travel Insurance';

          commitItems([
            { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: '✓ You\'re all set!' },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'receipt',
              subscription: existingRoaming,
              planName: roamingName,
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
              planName: insuranceName,
            },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'text',
              role: 'agent',
              text: 'You have both roaming and travel insurance for this trip. You\'re protected!',
            },
          ]);
          setInitialInsuranceExists(true);
          setPlanState({ hasRoaming: true, hasInsurance: true, showToggle: false });
          setPhase('complete');
          return;
        }

        // CASE 2: Has roaming, no insurance
        if (existingRoaming && !existingInsurance) {
          const roamingName = existingRoaming.roaming_plans?.plan_name ?? 'your roaming plan';
          appendItems([
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'receipt',
              subscription: existingRoaming,
              planName: roamingName,
            },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'text',
              role: 'agent',
              text: "Your roaming is covered. Now, let me make sure you're protected with travel insurance too.",
            },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'status',
              label: 'Checking travel insurance options…',
              state: 'active',
            },
          ]);

          try {
            const plan = await api.getInsuranceRecommendation(event.id);
            if (plan) {
              commitItems(
                itemsRef.current.map((item) =>
                  item.kind === 'status' && item.label === 'Checking travel insurance options…'
                    ? {
                        id: nextId(),
                        createdAt: Date.now(),
                        kind: 'travel_insurance',
                        plan: plan,
                        calendarEventId: event.id,
                      }
                    : item,
                ),
              );
              setCachedInsurancePlan(plan);
              appendItems([
                {
                  id: nextId(),
                  createdAt: Date.now(),
                  kind: 'text',
                  role: 'agent',
                  text: "Here's a plan that covers your trip. You can purchase it anytime before you travel.",
                },
              ]);
            }
          } catch (err) {
            if (__DEV__) console.warn('[useRoamingChat] Failed to fetch insurance recommendation', err);
          }

          setInitialInsuranceExists(false);
          setPlanState({ hasRoaming: true, hasInsurance: false, showToggle: false });
          setPhase('complete');
          return;
        }

        // CASE 3: Has insurance, no roaming
        if (!existingRoaming && existingInsurance) {
          const insuranceDetails = existingInsurance.plan_details || {};
          const insuranceName = insuranceDetails.planName || 'Travel Insurance';

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
              planName: insuranceName,
            },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'text',
              role: 'agent',
              text: "Your travel insurance is ready. Now let's get you connected with roaming for your trip.",
            },
          ]);

          setInitialInsuranceExists(true);
          setPlanState({ hasRoaming: false, hasInsurance: true, showToggle: false });
          setPhase('streaming');
          startStream(controller);
          return;
        }

        // CASE 4: Has neither - show toggle to let user choose, start with roaming stream
        if (!existingRoaming && !existingInsurance) {
          appendItems([
            { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: greetingText(event, { hasRoaming: false, hasInsurance: false, showToggle: true }) },
          ]);
          setPlanState({ hasRoaming: false, hasInsurance: false, showToggle: true });
          setPhase('streaming');
          setCurrentView('roaming');
          startStream(controller);
          return;
        }
      } catch (err) {
        if (__DEV__) console.warn('[useRoamingChat] listSubscriptions check failed', err);
      }

      if (cancelled) return;
      startStream(controller);
    })();

    return () => {
      cancelled = true;
      clearWatchdog();
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-once; guarded by startedRef
  }, [subscriptions, activeInsurance]);

  const switchView = useCallback(
    async (view: ViewMode) => {
      if (view === 'insurance' && !cachedInsurancePlan) {
        try {
          appendItems([
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'status',
              label: 'Checking travel insurance options…',
              state: 'active',
            },
          ]);

          const plan = await api.getInsuranceRecommendation(event.id);
          if (plan) {
            setCachedInsurancePlan(plan);
            commitItems(
              itemsRef.current.map((item) =>
                item.kind === 'status' && item.label === 'Checking travel insurance options…'
                  ? {
                      id: nextId(),
                      createdAt: Date.now(),
                      kind: 'travel_insurance',
                      plan: plan,
                      calendarEventId: event.id,
                    }
                  : item,
              ),
            );
          }
        } catch (err) {
          if (__DEV__) console.warn('[useRoamingChat] Failed to fetch insurance recommendation', err);
          pushErrorItem('Failed to load insurance options. Please try again.', true);
        }
      } else if (view === 'roaming') {
        const roamingCard = itemsRef.current.find((item) => item.kind === 'card');
        if (!roamingCard) {
          // Restart stream if we don't have roaming card yet
          const controller = new AbortController();
          abortControllerRef.current = controller;
          setPhase('streaming');
          startStream(controller);
        }
      }
      setCurrentView(view);
    },
    [cachedInsurancePlan, event.id, appendItems, commitItems, pushErrorItem],
  );

  const confirm = useCallback(
    (actionId: string) => {
      const target = itemsRef.current.find(
        (item): item is ConfirmationItem => item.kind === 'confirmation' && item.actionId === actionId,
      );
      if (!target) return;
      // Guard against double-tap. 'failed' is intentionally re-armable so the
      // inline Retry affordance in ConfirmationPrompt can resubmit via this
      // same path.
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
        .then(async (subscription) => {
          updateConfirmationItem(actionId, { state: 'confirmed' });
          // Refresh subscriptions in context immediately after purchase
          await refreshSubscriptions();
          appendItems([
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'receipt',
              subscription,
              planName: subscription.roaming_plans?.plan_name ?? target.summary,
            },
          ]);

          // Hide toggle since roaming is now activated
          setPlanState((prev) => ({ ...prev, showToggle: false }));

          // Check if user already has insurance
          if (initialInsuranceExists) {
            // User already has insurance, just show completion message
            appendItems([
              {
                id: nextId(),
                createdAt: Date.now(),
                kind: 'text',
                role: 'agent',
                text: '✓ You\'re all set! You have both roaming and travel insurance for this trip.',
              },
            ]);
            setPhase('complete');
          } else {
            // User doesn't have insurance yet, fetch and show recommendation
            appendItems([
              {
                id: nextId(),
                createdAt: Date.now(),
                kind: 'text',
                role: 'agent',
                text: "You're all set with roaming. Now, let's make sure you're protected with travel insurance.",
              },
              {
                id: nextId(),
                createdAt: Date.now(),
                kind: 'status',
                label: 'Checking travel insurance options…',
                state: 'active',
              },
            ]);

            // Fetch and show recommended insurance plan
            api
              .getInsuranceRecommendation(event.id)
              .then((plan) => {
                if (plan) {
                  // Replace the "Checking insurance options..." status with the actual plan
                  commitItems(
                    itemsRef.current.map((item) =>
                      item.kind === 'status' && item.label === 'Checking travel insurance options…'
                        ? {
                            id: nextId(),
                            createdAt: Date.now(),
                            kind: 'travel_insurance',
                            plan: plan,
                            calendarEventId: event.id,
                          }
                        : item,
                    ),
                  );
                  setCachedInsurancePlan(plan);
                  appendItems([
                    {
                      id: nextId(),
                      createdAt: Date.now(),
                      kind: 'text',
                      role: 'agent',
                      text: "Here's a plan that covers your trip. You can purchase it anytime before you travel.",
                    },
                  ]);
                  // Auto-switch to insurance view after roaming is activated
                  setCurrentView('insurance');
                }
                setPhase('complete');
              })
              .catch((err) => {
                if (__DEV__) console.warn('[useRoamingChat] Failed to fetch insurance recommendation', err);
                setPhase('complete');
              });
          }
        })
        .catch((err) => {
          updateConfirmationItem(actionId, {
            state: 'failed',
            error: err instanceof Error ? err.message : String(err),
          });
        });
    },
    [appendItems, updateConfirmationItem, event.id, initialInsuranceExists, commitItems, setCachedInsurancePlan, setCurrentView, setPhase, refreshSubscriptions],
  );

  const decline = useCallback(
    (actionId: string) => {
      const target = itemsRef.current.find(
        (item): item is ConfirmationItem => item.kind === 'confirmation' && item.actionId === actionId,
      );
      if (!target || target.state !== 'pending') return;

      updateConfirmationItem(actionId, { state: 'declined' });
      appendItems([
        {
          id: nextId(),
          createdAt: Date.now(),
          kind: 'text',
          role: 'agent',
          text: 'No problem — let me know if you change your mind.',
        },
      ]);
    },
    [appendItems, updateConfirmationItem],
  );

  const handleInsurancePurchased = useCallback(
    (purchaseData: any) => {
      if (onInsurancePurchased) {
        onInsurancePurchased(purchaseData);
      }
        // Show context-aware success message based on roaming status
      const hasRoamingActive = itemsRef.current.some((item) => item.kind === 'receipt' && 'subscription' in item && item.subscription?.roaming_plans);

      const successMessage = hasRoamingActive
        ? '✓ Your travel insurance is now active. You\'re all set for your trip!'
        : '✓ Your travel insurance is now active. You still don\'t have roaming plan. Please check the above plan and activate it now to be ready for your trip.';


      // Just show success message - full receipt will come from roaming activation flow
      appendItems([
        {
          id: nextId(),
          createdAt: Date.now(),
          kind: 'text',
          role: 'agent',
          text: successMessage,
        },
      ]);

      // Mark insurance as now existing (so roaming activation won't ask for insurance again)
      setInitialInsuranceExists(true);

      // Hide toggle since insurance is now activated
      setPlanState((prev) => ({ ...prev, showToggle: false }));

      // Check if we have a roaming card or receipt - if not, fetch roaming recommendation
      const hasRoamingContent = itemsRef.current.some((item) => item.kind === 'card' || (item.kind === 'receipt' && 'subscription' in item && item.subscription?.roaming_plans));

      if (!hasRoamingContent) {
        appendItems([
          {
            id: nextId(),
            createdAt: Date.now(),
            kind: 'text',
            role: 'agent',
            text: "Now let's get you connected with roaming for your trip.",
          },
          {
            id: nextId(),
            createdAt: Date.now(),
            kind: 'status',
            label: 'Checking roaming options…',
            state: 'active',
          },
        ]);

        // Fetch and show roaming recommendation
        api
          .recommendRoaming(event.id)
          .then((response) => {
            const roamingPlan = response.candidate_plan;
            if (roamingPlan) {
              commitItems(
                itemsRef.current.map((item) =>
                  item.kind === 'status' && item.label === 'Checking roaming options…'
                    ? {
                        id: nextId(),
                        createdAt: Date.now(),
                        kind: 'card',
                        card: {
                          kind: 'roaming_plan',
                          plan: roamingPlan,
                          reasoning: response.reasoning,
                          judge_approved: true,
                          judge_feedback: response.judge_feedback,
                        },
                      }
                    : item,
                ),
              );

              // Add confirmation prompt after roaming card
              appendItems([
                {
                  id: nextId(),
                  createdAt: Date.now(),
                  kind: 'confirmation',
                  actionId: `activate-roaming-${roamingPlan.id}`,
                  state: 'pending' as const,
                  calendarEventId: event.id,
                  planId: roamingPlan.id,
                  summary: roamingPlan.plan_name,
                  risk: 'commit' as const,
                },
              ]);
            }
          })
          .catch((err) => {
            if (__DEV__) console.warn('[useRoamingChat] Failed to fetch roaming recommendation', err);
          });
      } else {
        // Roaming content already exists - only add confirmation if it doesn't exist yet
        const existingConfirmation = itemsRef.current.some((item) => item.kind === 'confirmation');

        if (!existingConfirmation) {
          const existingRoamingCard = itemsRef.current.find((item) => item.kind === 'card');
          if (existingRoamingCard && existingRoamingCard.kind === 'card') {
            const roamingPlan = existingRoamingCard.card.kind === 'roaming_plan' ? existingRoamingCard.card.plan : null;
            if (roamingPlan) {
              appendItems([
                {
                  id: nextId(),
                  createdAt: Date.now(),
                  kind: 'confirmation',
                  actionId: `activate-roaming-${roamingPlan.id}`,
                  state: 'pending' as const,
                  calendarEventId: event.id,
                  planId: roamingPlan.id,
                  summary: roamingPlan.plan_name,
                  risk: 'commit' as const,
                },
              ]);
            }
          }
        }
      }

      // Auto-switch back to roaming view after insurance is purchased
      setCurrentView('roaming');
    },
    [appendItems, event.id, commitItems, onInsurancePurchased],
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

      // Append user message to items
      appendItems([{ id: nextId(), createdAt: Date.now(), kind: 'text', role: 'user', text }]);

      // Find the last card to extract plan/reasoning/feedback
      const lastCard = [...itemsRef.current].reverse().find((item): item is CardItem => item.kind === 'card');
      const priorPlan = lastCard?.card.kind === 'roaming_plan' ? lastCard.card.plan : undefined;
      const priorReasoning = lastCard?.card.kind === 'roaming_plan' ? lastCard.card.reasoning : '';
      const priorJudgeFeedback = lastCard?.card.kind === 'roaming_plan' ? lastCard.card.judge_feedback : '';

      // Start a new stream with the follow-up message and prior context
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

  return { items, phase, confirm, decline, retry, sendMessage, handleInsurancePurchased, currentView, switchView, planState };
}
