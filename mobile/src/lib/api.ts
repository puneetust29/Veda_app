import { loadToken } from './authToken';
import { log } from './logger';
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
  GroceryBasketSku,
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
  const method = init?.method ?? 'GET';
  const done = log.timer('API', `${method} ${path}`);
  log.start('API', `${method} ${path}`, {
    body: init?.body ? String(init.body).slice(0, 500) : undefined,
  });

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    done({ status: response.status, ok: false });
    log.fail('API', `${method} ${path}`, { status: response.status, body: body.slice(0, 300) });
    throw new Error(`${response.status} ${path}: ${body}`);
  }

  const data = await response.json();
  const ms = done({ status: response.status, ok: true });
  log.ok('API', `${method} ${path}`, { status: response.status, ms });
  return data as T;
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await loadToken();
  if (!token) {
    log.fail('API', 'authedFetch — no token', { path });
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
  listCalendarTrips: () =>
    authedFetch<{ trips: any[]; total_trips: number; total_round_trips: number }>('/calendar/trips').then(
      (res) => res.trips
    ),
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
    capability?: string;
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
      capability: params.capability ?? 'general_assistant',
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

  getCustomerPaymentMethods: () =>
    authedFetch<{
      brand: string | null;
      last4: string | null;
      id: string | null;
    }>('/payments/customer-payment-methods', {
      method: 'GET',
    }),

  // --- Grocery: save supermarket login session (called after in-app WebView login) ---
  saveAsdaSession: (data: {
    localStorage: Record<string, string>;
    cookies: string;
  }) =>
    authedFetch<{ saved: boolean }>('/grocery/asda/save-session', {
      method: 'POST',
      body: JSON.stringify({ local_storage: data.localStorage, cookies: data.cookies }),
    }),

  // --- Grocery: WebView checkout session (Phase 2) ---
  createCheckoutSession: (supermarketDomain: string, skus: GroceryBasketSku[]) =>
    authedFetch<{
      session_id: string;
      first_url: string;
      instruction: Record<string, unknown>;
      error?: string;
    }>('/grocery/checkout-session', {
      method: 'POST',
      body: JSON.stringify({ supermarket_domain: supermarketDomain, skus }),
    }),

  checkoutStep: (params: {
    session_id: string;
    screenshot_b64?: string;
    prev_result?: string;
    prev_error?: string;
  }) =>
    authedFetch<{
      done: boolean;
      success?: boolean;
      message?: string;
      instruction?: Record<string, unknown>;
      status_snackbar?: { localized_message?: string } | null;
    }>('/grocery/checkout-step', {
      method: 'POST',
      body: JSON.stringify({
        session_id: params.session_id,
        screenshot_b64: params.screenshot_b64 || '',
        prev_result: params.prev_result || '',
        prev_error: params.prev_error || '',
      }),
    }),

  // --- Grocery automated checkout ---
  // Streams SSE status events while Pepesto's browser automation loop runs.
  // Events: {kind:"status",text:"..."} and a final {kind:"done",success:bool,message:"..."}
  streamGroceryAutoCheckout: async (params: {
    supermarketDomain: string;
    skus: GroceryBasketSku[];
    signal: AbortSignal;
    onEvent: (event: { kind: string; text?: string; success?: boolean; message?: string }) => void;
    onError: (err: unknown) => void;
    onClose: () => void;
  }): Promise<void> => {
    const token = await loadToken();
    if (!token) throw new Error('Not authenticated');

    const streamDone = log.timer('API', 'SSE /grocery/auto-checkout');
    log.start('API', 'SSE /grocery/auto-checkout', {
      supermarket: params.supermarketDomain,
      skus: params.skus.length,
    });

    let eventCount = 0;
    return streamSse({
      url: `${API_BASE_URL}/grocery/auto-checkout`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        supermarket_domain: params.supermarketDomain,
        skus: params.skus,
      }),
      signal: params.signal,
      onFrame: (frame) => {
        try {
          const event = JSON.parse(frame.data);
          eventCount += 1;
          log.info('API', `SSE event #${eventCount}`, { kind: event.kind, text: event.text, success: event.success, message: event.message });
          if (event.kind === 'done') {
            streamDone({ events: eventCount, success: event.success });
          }
          params.onEvent(event);
        } catch {
          log.warn('API', 'SSE bad frame', { raw: frame.data?.slice(0, 100) });
        }
      },
      onError: (err) => {
        log.fail('API', 'SSE /grocery/auto-checkout error', { err: String(err), events: eventCount });
        params.onError(err);
      },
      onClose: () => {
        log.info('API', 'SSE /grocery/auto-checkout closed', { events: eventCount });
        params.onClose();
      },
    });
  },
};
