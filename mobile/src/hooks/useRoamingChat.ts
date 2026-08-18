import { useCallback, useEffect, useRef, useState } from 'react';

import { applyStreamEvent, nextId } from '../lib/chatThread';
import { api } from '../lib/api';
import type { AgentStreamEvent, CalendarEvent, ChatItem } from '../types';

export type ChatPhase = 'idle' | 'streaming' | 'awaiting_confirmation' | 'complete' | 'failed';

type ConfirmationItem = Extract<ChatItem, { kind: 'confirmation' }>;
type CardItem = Extract<ChatItem, { kind: 'card' }>;

const WATCHDOG_MS = 90_000;

function greetingText(event: CalendarEvent): string {
  const date = new Date(event.start_datetime).toLocaleDateString();
  const destination = event.destination ?? 'your destination';
  return `Looks like you're flying to ${destination} on ${date} — you don't have a roaming plan for this trip. Let me find you some options…`;
}

export function useRoamingChat(event: CalendarEvent) {
  const [items, setItems] = useState<ChatItem[]>(() => [
    { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: greetingText(event) },
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
    (controller: AbortController) => {
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
        const subscriptions = await api.listSubscriptions();
        if (cancelled) return;
        const existing = subscriptions.find((s) => s.calendar_event_id === event.id && s.status === 'active');
        if (existing) {
          appendItems([
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'receipt',
              subscription: existing,
              planName: existing.roaming_plans?.plan_name ?? 'your roaming plan',
            },
            {
              id: nextId(),
              createdAt: Date.now(),
              kind: 'text',
              role: 'agent',
              text: 'This trip is already covered — no need to do anything else.',
            },
          ]);
          setPhase('complete');
          return;
        }
      } catch (err) {
        // If the duplicate-subscription check itself fails, don't block the
        // whole chat on it — just proceed to start the stream normally.
        if (__DEV__) console.warn('[useRoamingChat] listSubscriptions check failed', err);
      }

      if (cancelled) return;
      startStream(controller);
    })();

    return () => {
      cancelled = true;
      clearWatchdog();
      // Abort whatever controller is currently active — not necessarily the
      // one created above. `retry()` swaps `abortControllerRef.current` for a
      // fresh controller, and unmount must tear down that live one, not this
      // effect's original (possibly already-superseded) `controller`.
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-once; guarded by startedRef
  }, []);

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
              text: "You're all set — I'll keep an eye on things for the rest of the trip.",
            },
          ]);
          setPhase('complete');
        })
        .catch((err) => {
          updateConfirmationItem(actionId, {
            state: 'failed',
            error: err instanceof Error ? err.message : String(err),
          });
        });
    },
    [appendItems, updateConfirmationItem],
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

  const retry = useCallback(() => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    startStream(controller);
  }, [startStream]);

  return { items, phase, confirm, decline, retry };
}
