import { useCallback, useRef, useState } from 'react';

import { applyStreamEvent, nextId } from '../lib/chatThread';
import { api } from '../lib/api';
import type { AgentStreamEvent, ChatItem } from '../types';

export type ChatPhase = 'idle' | 'streaming' | 'complete' | 'failed';

const WATCHDOG_MS = 90_000;

function greetingText(): string {
  return "Hi, I'm Veda — ask me about your travel plans or the Veda app.";
}

export function useVedaChat() {
  const [items, setItems] = useState<ChatItem[]>(() => [
    { id: nextId(), createdAt: Date.now(), kind: 'text', role: 'agent', text: greetingText() },
  ]);
  const [phase, setPhase] = useState<ChatPhase>('idle');

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const abortControllerRef = useRef<AbortController | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        case 'error':
          setPhase('failed');
          break;
        case 'done':
          setPhase('complete');
          break;
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
    (controller: AbortController, message: string) => {
      setPhase('streaming');
      resetWatchdog();

      // Extract recent text history for context (last 4 turns)
      const history = itemsRef.current
        .filter((item) => item.kind === 'text')
        .slice(-4)
        .map((item) => ({
          role: (item as any).role,
          text: (item as any).text,
        }));

      if (__DEV__) {
        console.log('[useVedaChat] Starting stream:', { message, historyLen: history.length });
      }

      api
        .streamVedaConversation({
          message,
          history,
          signal: controller.signal,
          onEvent: (event) => {
            if (__DEV__) console.log('[useVedaChat] Event:', event.type);
            handleStreamEvent(event);
          },
          onError: (err) => {
            if (__DEV__) console.error('[useVedaChat] Stream error:', err);
            if (controller.signal.aborted) return;
            handleStreamError(err);
          },
          onClose: () => {
            if (__DEV__) console.log('[useVedaChat] Stream closed');
            clearWatchdog();
          },
        })
        .catch((err) => {
          if (__DEV__) console.error('[useVedaChat] Catch error:', err);
          if (controller.signal.aborted) return;
          handleStreamError(err);
        });
    },
    [clearWatchdog, handleStreamError, handleStreamEvent, resetWatchdog],
  );

  const sendMessage = useCallback(
    (text: string) => {
      if (phase === 'streaming' || !text.trim()) return;

      // Append user message to items
      appendItems([{ id: nextId(), createdAt: Date.now(), kind: 'text', role: 'user', text }]);

      // Start stream with the message
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      startStream(controller, text);
    },
    [phase, appendItems, startStream],
  );

  const retry = useCallback(() => {
    // Find the last user message and retry with it
    const lastUserMsg = [...itemsRef.current]
      .reverse()
      .find((item) => item.kind === 'text' && (item as any).role === 'user');

    if (!lastUserMsg || (lastUserMsg as any).role !== 'user') return;

    // Clear error items and retry
    const withoutError = itemsRef.current.filter((item) => item.kind !== 'error');
    commitItems(withoutError);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    startStream(controller, (lastUserMsg as any).text);
  }, [commitItems, startStream]);

  return { items, phase, sendMessage, retry };
}
