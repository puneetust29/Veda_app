import type { AgentStreamEvent, ChatItem } from '../types';

// Pure reducer: no React, no IO. Turns a wire `AgentStreamEvent` into the next
// `ChatItem[]` thread state. Every unchanged item keeps its exact object
// reference — only the item(s) that actually changed (or the newly appended
// one) get a new reference — so `React.memo` on the row component skips
// re-rendering rows that didn't change.

let idCounter = 0;

export function nextId(): string {
  idCounter += 1;
  return `item-${idCounter}`;
}

export const TOOL_LABELS: Record<string, string> = {
  'mobile.get_roaming_plans': 'Checking the roaming catalogue…',
  'mobile.activate_roaming_plan': 'Activating your plan…',
};

function friendlyErrorMessage(code: string): string {
  switch (code) {
    case 'no_plan_found':
      return "I couldn't find a suitable roaming plan for this trip.";
    case 'agent_error':
      return 'An error occurred while processing your request. Please try again.';
    case 'no_agent_matched':
      return 'No agent could handle your request. Please try again.';
    default:
      return `Something went wrong while working on your request (${code}).`;
  }
}

function markActiveStatusesDone(items: ChatItem[]): ChatItem[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.kind === 'status' && item.state === 'active') {
      changed = true;
      return { ...item, state: 'done' as const };
    }
    return item;
  });
  return changed ? next : items;
}

function removeAllStatuses(items: ChatItem[]): ChatItem[] {
  const filtered = items.filter((item) => item.kind !== 'status');
  return filtered.length < items.length ? filtered : items;
}

function removeTransient(items: ChatItem[]): ChatItem[] {
  const filtered = items.filter((item) => !(item.kind === 'text' && item.transient));
  return filtered.length < items.length ? filtered : items;
}

function replaceActiveStatus(items: ChatItem[], newStatus: ChatItem): ChatItem[] {
  // Remove the last active status item and add the new one
  const filtered = items.filter(
    (item) => !(item.kind === 'status' && item.state === 'active'),
  );
  return [...filtered, newStatus];
}

export function applyStreamEvent(items: ChatItem[], event: AgentStreamEvent): ChatItem[] {
  switch (event.type) {
    case 'run_started':
      // No-op — nothing user-facing to render for this event today.
      return items;

    case 'status':
      return replaceActiveStatus(items, {
        id: nextId(),
        createdAt: Date.now(),
        kind: 'status',
        label: event.data.text,
        state: 'active',
      });

    case 'tool_started':
      return replaceActiveStatus(items, {
        id: nextId(),
        createdAt: Date.now(),
        kind: 'status',
        tool: event.data.tool,
        label: event.data.label ?? TOOL_LABELS[event.data.tool] ?? 'Working…',
        state: 'active',
      });

    case 'tool_completed': {
      const idx = findLastIndex(
        items,
        (item) => item.kind === 'status' && item.tool === event.data.tool && item.state === 'active',
      );
      if (idx === -1) return items;
      const next = items.slice();
      const target = next[idx];
      if (target.kind !== 'status') return items;
      next[idx] = { ...target, state: 'done' };
      return next;
    }

    case 'text':
      return [
        ...items,
        { id: nextId(), createdAt: Date.now(), kind: 'text', role: event.data.role, text: event.data.text },
      ];

    case 'recommendation_ready': {
      const clean = removeTransient(removeAllStatuses(items));
      return [...clean, { id: nextId(), createdAt: Date.now(), kind: 'card', card: event.data.card }];
    }

    case 'hotel_result': {
      const clean = removeTransient(removeAllStatuses(items));
      return [...clean, { id: nextId(), createdAt: Date.now(), kind: 'hotel', hotel: event.data }];
    }

    case 'transport_result': {
      const clean = removeTransient(removeAllStatuses(items));
      return [
        ...clean,
        { id: nextId(), createdAt: Date.now(), kind: 'transport', transport: event.data },
      ];
    }

    case 'maps_result': {
      const clean = removeTransient(removeAllStatuses(items));
      return [...clean, { id: nextId(), createdAt: Date.now(), kind: 'maps', maps: event.data }];
    }

    case 'share_draft': {
      const withDone = markActiveStatusesDone(items);
      return [...withDone, { id: nextId(), createdAt: Date.now(), kind: 'whatsapp_share', text: event.data.text }];
    }

    case 'confirmation_required': {
      const alreadyExists = items.some(
        (item) => item.kind === 'confirmation' && item.actionId === event.data.action_id,
      );
      if (alreadyExists) return items;
      return [
        ...items,
        {
          id: nextId(),
          createdAt: Date.now(),
          kind: 'confirmation',
          actionId: event.data.action_id,
          summary: event.data.summary,
          risk: event.data.risk,
          planId: event.data.plan_id,
          calendarEventId: event.data.calendar_event_id,
          state: 'pending',
        },
      ];
    }

    case 'error': {
      const withoutStatus = removeAllStatuses(items);
      return [
        ...withoutStatus,
        {
          id: nextId(),
          createdAt: Date.now(),
          kind: 'error',
          message: event.data.message ?? friendlyErrorMessage(event.data.code),
          retryable: event.data.retryable,
        },
      ];
    }

    case 'done':
      // Remove all status items when workflow completes
      return removeAllStatuses(items);

    default: {
      // Unknown event type — the backend contract could still shift under us.
      // Never throw; just ignore (loudly, in dev only).
      if (__DEV__) {
        console.warn('[chatThread] ignoring unknown stream event type', (event as { type?: unknown }).type);
      }
      return items;
    }
  }
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}
