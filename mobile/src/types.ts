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

export type RootStackParamList = {
  SignIn: undefined;
  Dashboard: undefined;
  FlightDetail: { event: CalendarEvent };
  Subscriptions: undefined;
};
