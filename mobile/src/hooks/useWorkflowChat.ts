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
import * as Location from 'expo-location';

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

function greetingText(
  event: CalendarEvent,
  hasRoamingActive: boolean,
  hasInsuranceActive: boolean
): string {
  const startDate = new Date(event.start_datetime);
  const month = startDate.toLocaleDateString('en-US', { month: 'long' });
  const destination = event.destination ?? 'your destination';
  const prefix = `I see you're travelling to ${destination} in ${month}.`;

  // If both roaming and insurance are already active
  if (hasRoamingActive && hasInsuranceActive) {
    return `${prefix}\n\nYou are all set for your trip! You have both roaming and travel insurance.`;
  }

  // If only roaming is active, insurance is pending
  if (hasRoamingActive && !hasInsuranceActive) {
    return `${prefix}\n\nYou have roaming! Let me help you get travel insurance to complete your trip.`;
  }

  // If only insurance is active, roaming is pending
  if (!hasRoamingActive && hasInsuranceActive) {
    return `${prefix}\n\nYou have travel insurance! Let me help you get roaming to complete your trip.`;
  }

  // If both are pending
  return `${prefix}\n\nYou've halfway there, and I've two recommendations to make you travel ready.`;
}

export function useWorkflowChat(event: CalendarEvent) {
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    currentStep: 'roaming',
    completedSteps: [],
  });

  const [items, setItems] = useState<ChatItem[]>(() => []);
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [showTripPrep, setShowTripPrep] = useState(true);

  // Mirrors `items` synchronously so callbacks always read latest state
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const abortControllerRef = useRef<AbortController | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  const deviceLocationRef = useRef<{ latitude: number; longitude: number; label?: string } | null>(null);
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
      console.log('[stream event]', event_.type, JSON.stringify((event_ as any).data ?? {}).slice(0, 200));
      resetWatchdog();
      const next = applyStreamEvent(itemsRef.current, event_);
      commitItems(next);

      switch (event_.type) {
        case 'transport_result':
          // dev-only — ignored in main chat flow
          break;
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
      console.log('[startStream] event_id=%s params=%s', event.id, JSON.stringify(params ?? {}));
      setPhase('streaming');
      resetWatchdog();
      api
        .streamRoamingConversation({
          calendarEventId: event.id,
          signal: controller.signal,
          onEvent: handleStreamEvent,
          onError: (err) => {
            if (controller.signal.aborted) return;
            console.warn('[startStream] SSE error:', err);
            handleStreamError(err);
          },
          onClose: () => {
            console.log('[startStream] SSE closed event_id=%s', event.id);
            clearWatchdog();
          },
          deviceLocation: deviceLocationRef.current,
          ...params,
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          console.error('[startStream] stream promise rejected:', err);
          handleStreamError(err);
        });
    },
    [clearWatchdog, event.id, handleStreamError, handleStreamEvent, resetWatchdog],
  );

  // Initialize: check for existing subscriptions and show trip prep
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let cancelled = false;

    (async () => {
      // Fetch device location in parallel — used by Uber agent for pickup coordinates
      Location.getForegroundPermissionsAsync().then((perm) => {
        if (perm.status === Location.PermissionStatus.GRANTED) {
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            .then((pos) => {
              deviceLocationRef.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            })
            .catch(() => {});
        }
      }).catch(() => {});

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

        // Check for hotel booking in raw event details
        const hasHotelBooking = !!(
          event.raw_details &&
          typeof event.raw_details === 'object' &&
          'hotel_name' in event.raw_details &&
          event.raw_details.hotel_name
        );

        // Show greeting message and trip preparation card
        commitItems([
          {
            id: nextId(),
            createdAt: Date.now(),
            kind: 'text',
            role: 'agent',
            text: greetingText(event, !!existingRoaming, !!existingInsurance),
          },
          {
            id: nextId(),
            createdAt: Date.now(),
            kind: 'trip_preparation',
            event,
            hasFlightBooking: true, // Always assume flight is booked
            hasHotelBooking,
            hasRoamingActive: !!existingRoaming,
            hasInsuranceActive: !!existingInsurance,
          },
        ]);
        console.log('[useWorkflowChat] trip_preparation loaded | hasFlightBooking=true | hasHotelBooking:', hasHotelBooking, '| hasRoamingActive:', !!existingRoaming, '| hasInsuranceActive:', !!existingInsurance);
        setPhase('awaiting_confirmation');
        return;
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
          // Check if insurance is already active
          const hasInsuranceReceipt = itemsRef.current.some((item) => {
            if (item.kind !== 'receipt' || !('planName' in item)) return false;
            const isInsurancePlan = item.planName?.toLowerCase().includes('insurance') ||
                                     item.planName?.toLowerCase().includes('travel');
            return isInsurancePlan;
          });
          console.log('[useWorkflowChat] confirm - hasInsuranceReceipt:', hasInsuranceReceipt);

          appendItems([
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'confirmation_success',
              planType: 'roaming' as const,
              planId: subscription.roaming_plan_id,
            },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'receipt',
              subscription,
              planName: subscription.roaming_plans?.plan_name ?? target.summary,
            },
          ]);

          // If insurance already active, show completion
          if (hasInsuranceReceipt) {
            console.log('[useWorkflowChat] Insurance already active, showing completion...');
            appendItems([
              {
                id: nextId(),
                createdAt: Date.now(),
                kind: 'text',
                role: 'agent',
                text: '✓ You\'re all set! You have both roaming and travel insurance for this trip.',
              },
            ]);
            setWorkflowState({
              currentStep: 'complete',
              completedSteps: ['roaming', 'insurance'],
            });
            setPhase('complete');
            return;
          }

          // Insurance not active, proceed with showing it
          appendItems([
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
      console.log('[useWorkflowChat] decline called with actionId:', actionId);
      const target = itemsRef.current.find(
        (item): item is ConfirmationItem => item.kind === 'confirmation' && item.actionId === actionId,
      );
      if (!target || target.state !== 'pending') {
        console.log('[useWorkflowChat] target not found or not pending:', { target, actionId });
        return;
      }

      updateConfirmationItem(actionId, { state: 'declined' });

      // Check if this is a roaming plan decline by looking at the most recent card
      const lastCard = [...itemsRef.current].reverse().find((item): item is CardItem => item.kind === 'card');
      const isRoamingDecline = lastCard?.card.kind === 'roaming_plan';
      console.log('[useWorkflowChat] lastCard:', lastCard, 'isRoamingDecline:', isRoamingDecline, 'currentStep:', workflowState.currentStep);

      if (isRoamingDecline && workflowState.currentStep === 'roaming') {
        console.log('[useWorkflowChat] Advancing to insurance...');

        // Check if insurance is already purchased (receipt exists in chat)
        // Insurance receipt has planName with "insurance" or subscription object without roaming_plans
        const hasInsuranceReceipt = itemsRef.current.some((item) => {
          if (item.kind !== 'receipt' || !('planName' in item)) return false;
          const isInsurancePlan = item.planName?.toLowerCase().includes('insurance') ||
                                   item.planName?.toLowerCase().includes('travel');
          return isInsurancePlan;
        });
        console.log('[useWorkflowChat] hasInsuranceReceipt:', hasInsuranceReceipt);

        if (hasInsuranceReceipt) {
          // Insurance already purchased, show completion
          console.log('[useWorkflowChat] Insurance already purchased, showing completion...');
          appendItems([
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'text',
              role: 'agent',
              text: '✓ You\'re all set! You have travel insurance for this trip. You can always add roaming later if you need it.',
            },
          ]);
          setWorkflowState((prev) => ({
            currentStep: 'complete',
            completedSteps: ['insurance'],
          }));
          setPhase('complete');
          return;
        }

        // Insurance not yet purchased, show it
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
        console.log('[useWorkflowChat] Fetching insurance for event:', event.id);
        api
          .getInsuranceRecommendation(event.id)
          .then((plan) => {
            console.log('[useWorkflowChat] Insurance plan fetched:', plan);
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
        ? '✓ You are all set for your trip! You have both roaming and travel insurance.'
        : '✓ Your travel insurance is now active. You can add roaming anytime if you need it.';

      // Create receipt for insurance purchase to track completion
      const newItems: ChatItem[] = [
        {
          id: nextId(),
          createdAt: Date.now(),
          kind: 'confirmation_success',
          planType: 'insurance' as const,
          planId: purchaseData.id || 'insurance-' + Date.now(),
        },
        {
          id: nextId(),
          createdAt: Date.now(),
          kind: 'receipt',
          subscription: {
            id: purchaseData.id || 'insurance-' + Date.now(),
            status: 'active',
            subscribed_at: Date.now(),
          } as any,
          planName: purchaseData.planName || 'Travel Insurance',
        },
        {
          id: nextId(),
          createdAt: Date.now(),
          kind: 'text',
          role: 'agent',
          text: successMessage,
        },
      ];

      appendItems(newItems);

      // Move to complete step
      setWorkflowState((prev) => ({
        currentStep: 'complete',
        completedSteps: Array.from(new Set([...prev.completedSteps, 'insurance'])),
      }));

      setPhase('complete');
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

      // Check if user is asking about insurance or roaming
      const insuranceKeywords = ['insurance', 'coverage', 'protect', 'travel insurance', 'claim', 'medical'];
      const roamingKeywords = ['roaming', 'data', 'mobile data', 'internet', 'connection', 'mobile plan', 'connectivity', 'call'];
      const messageText = text.toLowerCase();
      const mentionsInsurance = insuranceKeywords.some((keyword) => messageText.includes(keyword));
      const mentionsRoaming = roamingKeywords.some((keyword) => messageText.includes(keyword));

      // If user asks about insurance while on roaming step, skip to insurance
      if (mentionsInsurance && workflowState.currentStep === 'roaming') {
        console.log('[useWorkflowChat] User asking about insurance, skipping to insurance step');

        // Check if insurance already purchased
        const hasInsuranceReceipt = itemsRef.current.some((item) => {
          if (item.kind !== 'receipt' || !('planName' in item)) return false;
          const isInsurancePlan = item.planName?.toLowerCase().includes('insurance') ||
                                   item.planName?.toLowerCase().includes('travel');
          return isInsurancePlan;
        });

        if (hasInsuranceReceipt) {
          // Insurance already purchased, show completion
          appendItems([
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'text',
              role: 'agent',
              text: '✓ You already have travel insurance for this trip. You can always add roaming later if you need it.',
            },
          ]);
          setWorkflowState((prev) => ({
            currentStep: 'complete',
            completedSteps: ['insurance'],
          }));
          setPhase('complete');
          return;
        }

        // Show transition message
        appendItems([
          {
            id: nextId(),
            createdAt: Date.now(),
            kind: 'text',
            role: 'agent',
            text: 'Great question! Let me show you our travel insurance options.',
          },
        ]);

        // Update workflow state to insurance
        setWorkflowState((prev) => ({
          currentStep: 'insurance',
          completedSteps: prev.completedSteps,
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
                  text: 'You can always come back to add roaming if you need it.',
                },
              ]);
            }
            setPhase('complete');
          })
          .catch((err) => {
            if (__DEV__) console.warn('[useWorkflowChat] Failed to fetch insurance', err);
            setPhase('complete');
          });
        return;
      }

      // Check if user is asking about roaming while on insurance step or beyond
      const hasRoamingReceipt = itemsRef.current.some((item) => {
        if (item.kind !== 'receipt' || !('subscription' in item)) return false;
        return item.subscription?.roaming_plans !== undefined;
      });

      if (mentionsRoaming && workflowState.currentStep !== 'roaming' && !hasRoamingReceipt) {
        console.log('[useWorkflowChat] User asking about roaming, showing roaming step');

        // Check if roaming already active (shouldn't happen if we got here, but double check)
        if (hasRoamingReceipt) {
          appendItems([
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'text',
              role: 'agent',
              text: '✓ You already have roaming for this trip.',
            },
          ]);
          return;
        }

        // Show transition message
        appendItems([
          {
            id: nextId(),
            createdAt: Date.now(),
            kind: 'text',
            role: 'agent',
            text: 'Great question! Let me show you our roaming options.',
          },
        ]);

        // Update workflow state to roaming
        setWorkflowState((prev) => ({
          currentStep: 'roaming',
          completedSteps: prev.completedSteps.filter((step) => step !== 'roaming'), // Remove roaming from completed if present
        }));

        // Fetch and show roaming recommendation by calling the roaming stream fresh
        // This restarts the roaming agent as if we're going back to the roaming step
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setPhase('streaming');
        api
          .streamRoamingConversation({
            calendarEventId: event.id,
            signal: controller.signal,
            onEvent: handleStreamEvent,
            onError: (err) => {
              if (controller.signal.aborted) return;
              handleStreamError(err);
            },
            onClose: () => {
              // Don't clear watchdog - let normal flow handle it
            },
          })
          .catch((err) => {
            if (controller.signal.aborted) return;
            handleStreamError(err);
          });
        return;
      }

      // Normal message flow for roaming agent
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
    [phase, appendItems, startStream, workflowState.currentStep, event.id],
  );

  const continueWorkflow = useCallback(() => {
    // Keep trip preparation card and start workflow
    const tripPrepCard = itemsRef.current.find((item) => item.kind === 'trip_preparation');
    if (tripPrepCard?.kind !== 'trip_preparation') {
      console.warn('[useWorkflowChat] No trip prep card found');
      return;
    }

    // Immediately show a placeholder — removed automatically when real results arrive
    appendItems([{
      id: nextId(),
      createdAt: Date.now(),
      kind: 'text',
      role: 'agent',
      text: 'On it! Getting your trip recommendations ready…',
      transient: true,
    }]);

    const { hasRoamingActive, hasInsuranceActive } = tripPrepCard;

    if (hasRoamingActive && hasInsuranceActive) {
      // Both active - go to complete
      appendItems([
        { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: '✓ You\'re all set!' },
      ]);
      setWorkflowState({ currentStep: 'complete', completedSteps: ['roaming', 'insurance'] });
      setPhase('complete');
    } else if (hasRoamingActive && !hasInsuranceActive) {
      // Only roaming active - go to insurance
      appendItems([
        {
          id: nextId(),
          createdAt: Date.now(),
          kind: 'text',
          role: 'agent',
          text: '✓ Roaming is set up. Now let\'s get you travel insurance.',
        },
      ]);
      setWorkflowState({ currentStep: 'insurance', completedSteps: ['roaming'] });
      setPhase('streaming');

      // Fetch and show insurance
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
    } else if (!hasRoamingActive && hasInsuranceActive) {
      // Only insurance active - go to roaming
      appendItems([
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

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      startStream(controller);
    } else {
      // Neither active - start with roaming
      setWorkflowState({ currentStep: 'roaming', completedSteps: [] });
      setPhase('streaming');

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      startStream(controller);
    }
  }, [appendItems, event.id, startStream]);

  return { items, phase, confirm, decline, retry, sendMessage, handleInsurancePurchased, workflowState, continueWorkflow };
}
