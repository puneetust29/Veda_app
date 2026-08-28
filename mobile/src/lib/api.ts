import { loadToken } from './authToken';
import { mockStreamRoamingConversation, mockStreamVedaConversation } from './mockStream';
import { streamSse } from './sse';
import type {
  AgentStreamEvent,
  CalendarEvent,
  Customer,
  DeviceCalendarEvent,
  DeviceSyncResult,
  GoogleCalendarEvent,
  GoogleCalendarStatus,
  GoogleSyncResult,
  RecommendResponse,
  RoamingPlan,
  Subscription,
  TravelInsurancePlan,
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
  devLogin: (phoneNumber: string, otp?: string) =>
    rawFetch<{ access_token: string; customer: Customer }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ phone_number: phoneNumber, otp }),
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

  // --- Google Authentication (unified for Calendar + Gmail) ---
  // The app never touches a Google token: it asks the backend for a consent URL,
  // opens it, and afterwards re-reads status. Single auth flow for both services.
  // See backend/app/routers/google_auth.py.
  googleAuthStatus: () => authedFetch<GoogleCalendarStatus>('/auth/google/status'),
  startGoogleAuth: (appRedirect: string) =>
    authedFetch<{ authorization_url: string }>('/auth/google/connect', {
      method: 'POST',
      body: JSON.stringify({ app_redirect: appRedirect }),
    }),
  disconnectGoogleAuth: () =>
    authedFetch<{ calendar_disconnected: boolean; gmail_disconnected: boolean }>(
      '/auth/google/connection',
      { method: 'DELETE' },
    ),

  // --- Google Calendar ---
  googleCalendarStatus: () => authedFetch<GoogleCalendarStatus>('/calendar/google/status'),
  startGoogleCalendarAuth: (appRedirect: string) =>
    authedFetch<{ authorization_url: string }>('/calendar/google/connect', {
      method: 'POST',
      body: JSON.stringify({ app_redirect: appRedirect }),
    }),
  disconnectGoogleCalendar: () =>
    authedFetch<{ disconnected: boolean }>('/calendar/google/connection', { method: 'DELETE' }),
  listGoogleCalendarEvents: (maxResults = 20, flightsOnly = false) =>
    authedFetch<GoogleCalendarEvent[]>(
      `/calendar/google/events?max_results=${maxResults}&flights_only=${flightsOnly}`,
    ),
  syncGoogleCalendar: (maxResults = 20, flightsOnly = true) =>
    authedFetch<GoogleSyncResult>(
      `/calendar/google/sync?max_results=${maxResults}&flights_only=${flightsOnly}`,
      { method: 'POST' },
    ),

  // --- Device calendar (Apple Calendar via expo-calendar) ---
  syncDeviceCalendar: (events: DeviceCalendarEvent[], flightsOnly = true) =>
    authedFetch<DeviceSyncResult>('/calendar/device-events', {
      method: 'POST',
      body: JSON.stringify({ events, flights_only: flightsOnly }),
    }),

  // --- Gmail ---
  gmailStatus: () => authedFetch<GoogleCalendarStatus>('/gmail/status'),
  startGmailAuth: (appRedirect: string) =>
    authedFetch<{ authorization_url: string }>('/gmail/connect', {
      method: 'POST',
      body: JSON.stringify({ app_redirect: appRedirect }),
    }),
  disconnectGmail: () =>
    authedFetch<{ disconnected: boolean }>('/gmail/connection', { method: 'DELETE' }),
  listGmailMessages: (maxResults = 10) =>
    authedFetch<{ messages: any[]; count: number }>(`/gmail/messages?max_results=${maxResults}`),
  syncGmail: (maxResults = 10) =>
    authedFetch<{ fetched: number; synced: number; result_size_estimate: number }>(
      `/gmail/sync?max_results=${maxResults}`,
      { method: 'POST' },
    ),
  sendGmail: (params: { to: string; subject: string; body: string }) =>
    authedFetch<{ sent: boolean; gmail_message_id?: string }>('/gmail/send', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
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
    deviceLocation?: { latitude: number; longitude: number; label?: string } | null;
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
    if (params.deviceLocation) {
      body.device_location = params.deviceLocation;
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
          const event = JSON.parse(frame.data);
          if (__DEV__) console.log('[stream] event:', event.type, JSON.stringify(event.data));
          params.onEvent(event);
        } catch {
          if (__DEV__) console.warn('[stream] bad frame', frame);
        }
      },
      onError: params.onError,
      onClose: params.onClose,
    });
  },

  streamVedaConversation: async (params: {
    message: string;
    history?: Array<{ role: 'user' | 'agent'; text: string }>;
    signal: AbortSignal;
    onEvent: (event: AgentStreamEvent) => void;
    onError: (err: unknown) => void;
    onClose: () => void;
  }): Promise<void> => {
    if (process.env.EXPO_PUBLIC_CHAT_MOCK === '1') {
      return mockStreamVedaConversation(params);
    }

    const token = await loadToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const body = {
      capability: 'general_assistant',
      message: params.message,
      history: params.history || [],
    };

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

  // --- Travel Insurance ---
  getInsurancePlan: (planId: number) =>
    authedFetch<TravelInsurancePlan>(`/insurance/plans/${planId}`, {
      method: 'GET',
    }),

  getInsurancePlans: () =>
    authedFetch<TravelInsurancePlan[]>('/insurance/plans', {
      method: 'GET',
    }),

  getInsuranceRecommendation: (calendarEventId: string) =>
    authedFetch<TravelInsurancePlan | null>(
      `/insurance/plans/recommend?calendar_event_id=${encodeURIComponent(calendarEventId)}`,
      {
        method: 'GET',
      },
    ),

  createInsurancePaymentIntent: (planId: number, paymentMethodId: string) =>
    authedFetch<{
      client_secret: string;
      ephemeral_key_secret: string;
      customer_id: string;
      publishable_key: string;
    }>('/payments/insurance/intent', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        payment_method_id: paymentMethodId,
      }),
    }),

  confirmInsurancePurchase: (planId: number, paymentIntentId: string, calendarEventId?: string) =>
    authedFetch<{
      id: string;
      status: string;
      plan_id: number;
      purchased_at: string;
      plan_details: any;
    }>('/payments/insurance/confirm', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: planId,
        payment_intent_id: paymentIntentId,
        calendar_event_id: calendarEventId,
      }),
    }),

  getActiveInsurance: () =>
    authedFetch<{
      purchases: Array<{
        id: string;
        calendar_event_id: string;
        status: string;
        purchased_at: string;
        plan_details: any;
      }>;
    }>('/payments/insurance/active', {
      method: 'GET',
    }),
};
