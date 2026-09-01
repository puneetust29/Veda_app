import type { AgentStreamEvent, RoamingPlan } from '../types';

// Dev-only scripted replay of a realistic `/chat/stream` event sequence, so
// the whole chat UI (reducer, hook, components, screen) can be built and
// exercised before the real backend endpoint exists. Gated by
// `EXPO_PUBLIC_CHAT_MOCK=1` — see `lib/api.ts`.
//
// Events are emitted with realistic delays (via a small async generator +
// setTimeout) so the UI's incremental-append behavior is actually exercised,
// not just a single synchronous flush.

export type MockStreamParams = {
  calendarEventId: string;
  signal: AbortSignal;
  onEvent: (event: AgentStreamEvent) => void;
  onError: (err: unknown) => void;
  onClose: () => void;
  message?: string;
  priorPlan?: RoamingPlan;
  priorReasoning?: string;
  priorJudgeFeedback?: string;
};

const MOCK_PLAN: RoamingPlan = {
  id: 'mock-plan-jp-7d-5gb',
  country_code: 'JP',
  country_name: 'Japan',
  region: 'Asia',
  duration_days: 7,
  data_gb: 5,
  price: 25,
  currency: 'EUR',
  plan_name: 'Japan 7-day · 5GB',
  description: 'High-speed data for a week in Japan, no daily cap.',
};

function scriptedEvents(calendarEventId: string): Array<{ delayMs: number; event: AgentStreamEvent }> {
  const runId = `mock-run-${Date.now()}`;
  const planId = MOCK_PLAN.id;

  return [
    { delayMs: 50, event: { type: 'run_started', data: { run_id: runId, agents: ['roaming_agent'] } } },
    { delayMs: 150, event: { type: 'status', data: { text: 'Reading your flight details…' } } },
    { delayMs: 600, event: { type: 'status', data: { text: "You're going to Japan for 7 days." } } },
    { delayMs: 500, event: { type: 'tool_started', data: { tool: 'mobile.get_roaming_plans' } } },
    { delayMs: 900, event: { type: 'tool_completed', data: { tool: 'mobile.get_roaming_plans' } } },
    { delayMs: 400, event: { type: 'status', data: { text: 'Comparing 3 roaming plans…' } } },
    {
      delayMs: 1100,
      event: {
        type: 'status',
        data: { text: 'Second opinion: 30 days is wasteful for a 7-day trip. Trying again…', attempt: 2 },
      },
    },
    {
      delayMs: 900,
      event: {
        type: 'recommendation_ready',
        data: {
          card: {
            kind: 'roaming_plan',
            plan: MOCK_PLAN,
            reasoning:
              'A 7-day, 5GB plan matches the length of the trip closely and covers typical maps/messaging/social usage without paying for unused data.',
            judge_approved: true,
            judge_feedback: 'Duration and data allowance both fit a one-week trip. Approved.',
          },
        },
      },
    },
    {
      delayMs: 500,
      event: {
        type: 'confirmation_required',
        data: {
          action_id: `mock-action-${Date.now()}`,
          summary: `Activate ${MOCK_PLAN.plan_name} — ${MOCK_PLAN.price} ${MOCK_PLAN.currency}`,
          risk: 'commit',
          plan_id: planId,
          calendar_event_id: calendarEventId,
        },
      },
    },
    { delayMs: 200, event: { type: 'done', data: { status: 'awaiting_approval' } } },
  ];
}

function followupScriptedEvents(message: string): Array<{ delayMs: number; event: AgentStreamEvent }> {
  // If message contains "weather", it's off-topic. Otherwise, it's on-topic.
  const isOffTopic = message.toLowerCase().includes('weather');
  const reply = isOffTopic
    ? 'I can only help with roaming plans for this trip. Please start a new chat with Veda for anything else.'
    : `That's a great question! Based on the catalog, the 7-day plan is excellent for your trip length and typical data usage.`;

  return [
    { delayMs: 50, event: { type: 'run_started', data: { run_id: `mock-run-${Date.now()}`, agents: ['roaming_agent'] } } },
    {
      delayMs: 800,
      event: {
        type: 'text',
        data: { role: 'agent', text: reply },
      },
    },
    { delayMs: 200, event: { type: 'done', data: { status: 'ok_no_action' } } },
  ];
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function mockStreamRoamingConversation(params: MockStreamParams): Promise<void> {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    params.onClose();
  };

  try {
    const events = params.message ? followupScriptedEvents(params.message) : scriptedEvents(params.calendarEventId);
    for (const { delayMs, event } of events) {
      await delay(delayMs, params.signal);
      params.onEvent(event);
    }
    close();
  } catch (err) {
    if (params.signal.aborted) {
      close();
      return;
    }
    params.onError(err);
    close();
  }
}

export type MockVedaChatParams = {
  message: string;
  history?: Array<{ role: 'user' | 'agent'; text: string }>;
  signal: AbortSignal;
  onEvent: (event: AgentStreamEvent) => void;
  onError: (err: unknown) => void;
  onClose: () => void;
};

function vedaScriptedEvents(message: string): Array<{ delayMs: number; event: AgentStreamEvent }> {
  const isOffTopic = message.toLowerCase().includes('weather') || message.toLowerCase().includes('recipe');
  const hasSendKeyword = message.toLowerCase().includes('tell') || message.toLowerCase().includes('message');

  const reply = isOffTopic
    ? 'I can only help with travel plans and Veda app features. For other questions, please ask elsewhere.'
    : 'That sounds great! I can help you with your travel plans. Let me know if you need information about roaming plans, calendar sync, or anything else Veda-related.';

  const events: Array<{ delayMs: number; event: AgentStreamEvent }> = [
    { delayMs: 50, event: { type: 'run_started', data: { run_id: `mock-run-${Date.now()}`, agents: ['veda_agent'] } } },
    {
      delayMs: 600,
      event: {
        type: 'text',
        data: { role: 'agent', text: reply },
      },
    },
  ];

  if (hasSendKeyword) {
    events.push({
      delayMs: 400,
      event: {
        type: 'share_draft',
        data: { text: "Hi there! Just wanted to let you know I've landed safely. I'm all set with my roaming plan and ready to explore!" },
      },
    });
  }

  events.push({ delayMs: 200, event: { type: 'done', data: { status: 'ok_no_action' } } });
  return events;
}

export async function mockStreamVedaConversation(params: MockVedaChatParams): Promise<void> {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    params.onClose();
  };

  try {
    const events = vedaScriptedEvents(params.message);
    for (const { delayMs, event } of events) {
      await delay(delayMs, params.signal);
      params.onEvent(event);
    }
    close();
  } catch (err) {
    if (params.signal.aborted) {
      close();
      return;
    }
    params.onError(err);
    close();
  }
}
