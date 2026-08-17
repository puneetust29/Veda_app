import { supabase } from './supabase';
import type { CalendarEvent, Customer, RecommendResponse, RoamingPlan, Subscription } from '../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    'Missing EXPO_PUBLIC_API_BASE_URL — copy mobile/.env.example to mobile/.env and fill it in.',
  );
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${path}: ${body}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  syncProfile: () => authedFetch<Customer>('/auth/sync-profile', { method: 'POST' }),
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
};
