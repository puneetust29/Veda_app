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
  UberBookResponse,
  UberDeeplinkResponse,
} from '../types';

const IS_MOCK = process.env.EXPO_PUBLIC_CHAT_MOCK === '1';

// Shared mock plan — mirrors MOCK_PLAN in mockStream.ts so the receipt card
// renders correctly in mock mode without touching the real database.
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
  }): Promise<Subscription> => {
    if (IS_MOCK) {
      // Return a synthetic subscription so the receipt card and completion
      // message render correctly without hitting the real database.
      return Promise.resolve({
        id: `mock-sub-${Date.now()}`,
        customer_id: 'mock-customer',
        roaming_plan_id: params.roamingPlanId,
        calendar_event_id: params.calendarEventId,
        status: 'active',
        agent_reasoning: { reasoning: params.reasoning },
        subscribed_at: new Date().toISOString(),
        roaming_plans: MOCK_PLAN,
        calendar_events: {} as CalendarEvent,
      });
    }
    return authedFetch<Subscription>('/roaming/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        calendar_event_id: params.calendarEventId,
        roaming_plan_id: params.roamingPlanId,
        reasoning: params.reasoning,
        judge_feedback: params.judgeFeedback,
      }),
    });
  },
  listSubscriptions: (): Promise<Subscription[]> => {
    // In mock mode, skip the real DB — pre-existing real subscriptions would
    // short-circuit useRoamingChat and hide the entire stream (roaming card,
    // Uber card, confirmation prompt). The mock plan ID is also not a valid
    // UUID so any subscribe call would 500.
    if (IS_MOCK) return Promise.resolve([]);
    return authedFetch<Subscription[]>('/subscriptions');
  },
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
    pickupLatitude?: number;
    pickupLongitude?: number;
    pickupLabel?: string;
    startUberLogin?: boolean;
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
    if (params.pickupLatitude != null && params.pickupLongitude != null) {
      body.pickup_latitude = params.pickupLatitude;
      body.pickup_longitude = params.pickupLongitude;
      body.pickup_label = params.pickupLabel;
    }
    if (params.startUberLogin) {
      body.start_uber_login = true;
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
  // Deep-link handoff only -- no Uber account/OAuth needed (see backend/app/tools/uber_deeplink.py).
  // Real in-app price/booking is currently blocked pending Uber access approval.
  getUberDeeplink: (params: {
    calendarEventId: string;
    pickupLatitude?: number;
    pickupLongitude?: number;
    pickupLabel?: string;
  }) => {
    const query = new URLSearchParams({ calendar_event_id: params.calendarEventId });
    if (params.pickupLatitude != null && params.pickupLongitude != null) {
      query.set('pickup_latitude', String(params.pickupLatitude));
      query.set('pickup_longitude', String(params.pickupLongitude));
      if (params.pickupLabel) {
        query.set('pickup_label', params.pickupLabel);
      }
    }
    return authedFetch<UberDeeplinkResponse>(`/uber/deeplink?${query.toString()}`);
  },
  getUberAuthUrl: () =>
    authedFetch<{ available: boolean; auth_url: string | null; message: string }>(`/uber/auth-url`),
  getUberSession: () =>
    authedFetch<{ connected: boolean; user_sub: string | null; connect_url: string | null }>('/uber/session'),
  getUberConnectUrl: (returnUrl?: string) => {
    const query = returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : '';
    return authedFetch<{ auth_url: string }>(`/uber/connect${query}`);
  },
  getUberOptions: (params: {
    calendarEventId: string;
    pickupLatitude?: number;
    pickupLongitude?: number;
    pickupLabel?: string;
  }) => {
    const query = new URLSearchParams({ calendar_event_id: params.calendarEventId });
    if (params.pickupLatitude != null && params.pickupLongitude != null) {
      query.set('pickup_latitude', String(params.pickupLatitude));
      query.set('pickup_longitude', String(params.pickupLongitude));
      if (params.pickupLabel) query.set('pickup_label', params.pickupLabel);
    }
    return authedFetch<{
      uber_app_url: string | null;
      deep_link_url: string | null;
      live_quote: unknown;
      ride_products: import('../types').UberRideProduct[];
      connect_uber_url: string | null;
    }>(`/uber/options?${query.toString()}`);
  },
  bookUberRide: (params: {
    calendarEventId: string;
    productName: string;
    pickupLatitude?: number;
    pickupLongitude?: number;
    pickupLabel?: string;
  }) =>
    authedFetch<UberBookResponse>('/uber/book', {
      method: 'POST',
      body: JSON.stringify({
        calendar_event_id: params.calendarEventId,
        product_name: params.productName,
        pickup_latitude: params.pickupLatitude,
        pickup_longitude: params.pickupLongitude,
        pickup_label: params.pickupLabel,
      }),
    }),
};
