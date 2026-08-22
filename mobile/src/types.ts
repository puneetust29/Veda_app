export type Customer = {
  id: string;
  phone_number: string;
  full_name: string;
  address: string;
  telecom_plan: string;
  account_number: string;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  customer_id: string;
  title: string;
  event_type: 'flight' | 'other';
  origin: string | null;
  destination: string | null;
  start_datetime: string;
  end_datetime: string;
  raw_details: Record<string, unknown>;
  created_at: string;
};

export type RoamingPlan = {
  id: string;
  country_code: string;
  country_name: string;
  region: string;
  duration_days: number;
  data_gb: number;
  price: number;
  currency: string;
  plan_name: string;
  description: string;
};

export type RecommendResponse = {
  calendar_event_id: string;
  destination_country: string;
  trip_duration_days: number;
  candidate_plan: RoamingPlan | null;
  reasoning: string;
  judge_approved: boolean;
  judge_feedback: string;
};

export type Subscription = {
  id: string;
  customer_id: string;
  roaming_plan_id: string;
  calendar_event_id: string;
  status: 'proposed' | 'active' | 'failed';
  agent_reasoning: Record<string, unknown>;
  subscribed_at: string | null;
  roaming_plans: RoamingPlan;
  calendar_events: CalendarEvent;
};

export type UberAirportOption = {
  label: string;
  uber_app_url: string;
  deep_link_url: string;
};

export type UberLiveQuote = {
  product_name: string;
  estimate: string;
  currency_code?: string | null;
  eta_minutes?: number | null;
};

export type UberDeeplinkResponse = {
  uber_app_url: string | null;    // uber:// scheme — opens native app, reliably pre-fills fields
  deep_link_url: string | null;   // https://m.uber.com/ul/ — web fallback if app not installed
  destination_label: string | null; // Uber dropoff label, usually the trip's departure airport
  airport_options: UberAirportOption[];
};

export type RootStackParamList = {
  SignIn: undefined;
  Dashboard: undefined;
  FlightDetail: { event: CalendarEvent };
  Chat: { event: CalendarEvent };
  Subscriptions: undefined;
  RoamingPlans: undefined;
};

// --- Chat / streaming agent contract ---

export type RecommendationCardPayload =
  | { kind: 'roaming_plan'; plan: RoamingPlan; reasoning: string; judge_approved: boolean; judge_feedback: string }
  | {
      kind: 'uber_ride';
      suggested_message: string;
      reasoning: string;
      pickup_label: string | null;
      dropoff_label: string | null;
      uber_app_url: string | null;
      deep_link_url: string | null;
      airport_options?: UberAirportOption[];
      connect_uber_url?: string | null;
      live_quote?: UberLiveQuote | null;
      quote_status?: string | null;
    };

// The wire event contract emitted by `POST /chat/stream`. This is the backend's
// still-being-finalized shape — only `chatThread.ts` should need to know both this
// and `ChatItem` below; everything else in the app works off the stable render model.
export type AgentStreamEvent =
  | { type: 'run_started'; data: { run_id: string; agents: string[] } }
  | { type: 'status'; data: { text: string; attempt?: number } }
  | { type: 'tool_started'; data: { tool: string; label?: string } }
  | { type: 'tool_completed'; data: { tool: string } }
  | { type: 'text'; data: { role: 'agent' | 'user'; text: string } }
  | { type: 'recommendation_ready'; data: { card: RecommendationCardPayload } }
  | {
      type: 'confirmation_required';
      data: { action_id: string; summary: string; risk: 'commit' | 'read'; plan_id: string; calendar_event_id: string };
    }
  | { type: 'error'; data: { code: string; message?: string; retryable: boolean } }
  | { type: 'done'; data?: { status?: string } | null };

// The stable render model the UI works off. Derived from `AgentStreamEvent`s via
// `chatThread.ts`'s `applyStreamEvent` reducer, plus a few client-generated items
// (the greeting, the duplicate-subscription receipt).
type ChatItemBase = { id: string; createdAt: number };

export type ChatItem =
  | (ChatItemBase & { kind: 'text'; role: 'agent' | 'user'; text: string })
  | (ChatItemBase & { kind: 'status'; tool?: string; label: string; state: 'active' | 'done' })
  | (ChatItemBase & { kind: 'card'; card: RecommendationCardPayload })
  | (ChatItemBase & {
      kind: 'confirmation';
      actionId: string;
      summary: string;
      risk: 'commit' | 'read';
      planId: string;
      calendarEventId: string;
      state: 'pending' | 'submitting' | 'confirmed' | 'declined' | 'failed';
      error?: string;
    })
  | (ChatItemBase & { kind: 'receipt'; subscription: Subscription; planName: string })
  | (ChatItemBase & { kind: 'error'; message: string; retryable: boolean });
