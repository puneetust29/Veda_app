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
  source: 'google' | 'device' | 'gmail' | 'mock';
  raw_details: Record<string, unknown>;
  created_at: string;
};

export type WeatherSummary = {
  temperatureC: number;
  location: string;
  weatherCode: number | null;
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

export type TravelInsurancePlan = {
  id: number;
  provider: string;
  planName: string;
  planType: string;
  coverageStart: string;
  coverageEnd: string;
  premiumAmount: number;
  currency: string;
  currencyCode: string;
  whyThisOne: string[];
  benefitsSummary: string;
  fullCoverageDetails: Record<string, string[]>;
  stripeAmountCents: number;
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

// --- Google Calendar ---

// `configured: false` means the backend has no GOOGLE_CLIENT_ID/SECRET, so every
// Google route answers 503. Distinct from `connected: false`, which means the
// backend is set up but this customer hasn't consented yet.
// `calendar_connected` and `gmail_connected` indicate which individual services
// are authenticated (both are set after unified /auth/google auth).
export type GoogleCalendarStatus = {
  configured: boolean;
  connected: boolean;
  calendar_connected?: boolean;
  gmail_connected?: boolean;
  google_account_email?: string | null;
  scope?: string | null;
};

// A raw Google Calendar API event resource, passed through untouched by
// GET /calendar/google/events. Only the fields the UI reads are typed.
export type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export type GoogleSyncResult = {
  fetched: number;
  synced: number;
  skipped_all_day: number;
  skipped_non_flight: number;
};

// `source` distinguishes which account synced the underlying calendar to the
// device: 'google' when expo-calendar's Calendar.Source looks like a Google
// account (source.type === 'com.google' on Android, or a CalDAV source named
// after a gmail.com address on iOS), 'apple' for the device's local/iCloud
// calendars, 'other' for anything else (Outlook, Yahoo, etc.). This is
// client-side display metadata only -- the backend's /calendar/device-events
// ignores unrecognized fields and always stores these as source: "device".
export type DeviceCalendarSource = 'google' | 'apple' | 'other';

export type DeviceCalendarEvent = {
  device_event_id: string;
  title: string;
  location?: string;
  notes?: string;
  start: string;
  end: string;
  calendarTitle: string;
  source: DeviceCalendarSource;
};

export type DeviceSyncResult = {
  fetched: number;
  synced: number;
  skipped_non_flight: number;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Dashboard: undefined;
  FlightDetail: { event: CalendarEvent };
  Chat: { event: CalendarEvent };
  VedaChat: undefined;
  Subscriptions: undefined;
  RoamingPlans: undefined;
  // Single merged calendar screen: reads every calendar expo-calendar exposes
  // on-device (Apple Calendar, plus Google/Outlook/etc. if the user added
  // those accounts in the OS Settings app) and displays them together.
  DeviceCalendar: undefined;
  Gmail: undefined;
  // Dev-only integrations catalog (see dev/devFlags.ts and dev/DevNavigator.tsx)
  // -- a self-contained nested navigator; its own screens/params live in
  // dev/types.ts, not here.
  Dev: undefined;
};

// --- Onboarding flow (pre-auth) ---

export type PlanTier = 'lite' | 'balanced' | 'complete';

export type OnboardingStackParamList = {
  Landing: undefined;
  PhoneEntry: undefined;
  OtpVerification: undefined;
  Welcome: undefined;
  PlanSelection: undefined;
  AppPermissions: undefined;
  AccountSelection: undefined;
  Consent: undefined;
  Success: undefined;
};

// --- Chat / streaming agent contract ---

export type RecommendationCardPayload =
  | { kind: 'roaming_plan'; plan: RoamingPlan; reasoning: string; judge_approved: boolean; judge_feedback: string };

export type HotelBooking = {
  found: boolean;
  hotel_name?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  location?: string | null;
  source?: 'calendar' | 'email' | null;
  confidence?: number;
};

export type HotelDetectionResultPayload = {
  hotel: HotelBooking | null;
  suggestion: string;
  recommendations?: Array<{ name: string; rating: number; price: number; location: string }> | null;
};

export type TransportLineStatus = {
  line_name: string;
  status: string;
  severity: number;
  disruption: string | null;
};

export type TransportJourneyLeg = {
  mode: string;
  instruction: string;
  duration_mins: number;
};

export type TransportJourneyOption = {
  duration_mins: number;
  legs: TransportJourneyLeg[];
};

export type TransportResultPayload = {
  has_london: boolean;
  direction: 'from_london' | 'to_london' | null;
  airport: string | null;
  line_statuses: TransportLineStatus[];
  journey_options: TransportJourneyOption[];
  summary: string;
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
  | { type: 'hotel_result'; data: HotelDetectionResultPayload }
  | { type: 'transport_result'; data: TransportResultPayload }
  | { type: 'share_draft'; data: { text: string } }
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
  | (ChatItemBase & { kind: 'hotel'; hotel: HotelDetectionResultPayload })
  | (ChatItemBase & { kind: 'whatsapp_share'; text: string })
  | (ChatItemBase & { kind: 'travel_insurance'; plan: TravelInsurancePlan; calendarEventId: string })
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
  | (ChatItemBase & {
      kind: 'trip_preparation';
      event: CalendarEvent;
      hasFlightBooking: boolean;
      hasHotelBooking: boolean;
      hasRoamingActive: boolean;
      hasInsuranceActive: boolean;
      hasTransportInfo: boolean;
    })
  | (ChatItemBase & {
      kind: 'confirmation_success';
      planType: 'roaming' | 'insurance';
      planId: string;
    })
  | (ChatItemBase & { kind: 'transport'; transport: TransportResultPayload })
  | (ChatItemBase & { kind: 'error'; message: string; retryable: boolean });
