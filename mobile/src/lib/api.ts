import { loadToken } from './authToken';
import { mockStreamRoamingConversation } from './mockStream';
import { streamSse } from './sse';
import type {
  AgentStreamEvent,
  CalendarEvent,
  Customer,
  RecommendResponse,
  RoamingPlan,
  Subscription,
} from '../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    'Missing EXPO_PUBLIC_API_BASE_URL — copy mobile/.env.example to mobile/.env and fill it in.',
  );
}

async function rawFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${path}: ${body}`);
  }
  return response.json() as Promise<T>;
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await loadToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  return rawFetch<T>(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
}

export const api = {
  // POC-only: mints a token without a real OTP round-trip (see backend/app/routers/auth.py::dev_login).
  devLogin: (phoneNumber: string) =>
    rawFetch<{ access_token: string; customer: Customer }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber }),
    }),
  getMe: () => authedFetch<Customer>('/me'),
  listCalendarEvents: () => authedFetch<CalendarEvent[]>('/calendar/events'),
  listRoamingPlans: () => authedFetch<RoamingPlan[]>('/roaming/plans'),
  recommendRoaming: (calendarEventId: string) =>
    authedFetch<RecommendResponse>('/roaming/recommend', {
      method: 'POST',
      body: JSON.stringify({ calendar_event_id: calendarEventId }),
    }),
  subscribeRoaming: (params: {
    calendarEventId: string;
    roamingPlanId: string;
    reasoning: string;
    judgeFeedback: string;
  }) =>
    authedFetch<Subscription>('/roaming/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        calendar_event_id: params.calendarEventId,
        roaming_plan_id: params.roamingPlanId,
        reasoning: params.reasoning,
        judge_feedback: params.judgeFeedback,
      }),
    }),
  listSubscriptions: () => authedFetch<Subscription[]>('/subscriptions'),
  streamRoamingConversation: async (params: {
    calendarEventId: string;
    signal: AbortSignal;
    onEvent: (event: AgentStreamEvent) => void;
    onError: (err: unknown) => void;
    onClose: () => void;
    message?: string;
    priorPlan?: RoamingPlan;
    priorReasoning?: string;
    priorJudgeFeedback?: string;
  }): Promise<void> => {
    if (process.env.EXPO_PUBLIC_CHAT_MOCK === '1') {
      return mockStreamRoamingConversation(params);
    }

    const token = await loadToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const body: any = { calendar_event_id: params.calendarEventId };
    if (params.message) {
      body.message = params.message;
      body.prior_plan = params.priorPlan;
      body.prior_reasoning = params.priorReasoning;
      body.prior_judge_feedback = params.priorJudgeFeedback;
    }

    return streamSse({
      url: `${API_BASE_URL}/chat/stream`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: params.signal,
      onFrame: (frame) => {
        try {
          params.onEvent(JSON.parse(frame.data));
        } catch {
          if (__DEV__) console.warn('bad frame', frame);
        }
      },
      onError: params.onError,
      onClose: params.onClose,
    });
  },
};
