import { getDeviceLocationSample } from '../lib/deviceLocation';
import { shareToWhatsApp } from '../lib/whatsapp';
import { VEDA_CONTACT } from './vedaContact';

export type IntegrationStatus = 'Done' | 'In Progress' | 'Not Started';
export type IntegrationPriority = 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Foundation';

export type IntegrationAction = {
  label: string;
  run: () => Promise<{ summary: string }>;
};

export type IntegrationCatalogEntry = {
  id: string;
  category: string;
  name: string;
  purpose: string;
  exampleUsage: string;
  status: IntegrationStatus;
  priority?: IntegrationPriority;
  notes: string;
  // Present only once an entry has a standalone test wired up in this catalog.
  // Independent of `status` above, which just mirrors the tracking spreadsheet.
  action?: IntegrationAction;
};

// Mirrors the integrations tracking spreadsheet row-for-row (category,
// purpose, example usage, status, priority, notes). This file is the single
// source of truth for the dev catalog -- update an entry here as it moves
// from "Not Started" to built, and attach `action` once it's testable.
export const INTEGRATIONS_CATALOG: IntegrationCatalogEntry[] = [
  // --- Data Sync & Context ---
  {
    id: 'gmail-sync',
    category: 'Data Sync & Context',
    name: 'Gmail',
    purpose: 'Sync / Read Context',
    exampleUsage: 'Read travel confirmations, bookings and relevant emails',
    status: 'Done',
    priority: 'Tier 1',
    notes:
      'Silent mobile-number verification; strong fit for passwordless onboarding/authentication',
  },
  {
    id: 'google-calendar',
    category: 'Data Sync & Context',
    name: 'Google Calendar',
    purpose: 'Sync / Read Context',
    exampleUsage: 'Meetings, travel plans, events',
    status: 'Done',
    priority: 'Tier 1',
    notes: 'Meetings, travel plans and event context',
  },
  {
    id: 'apple-calendar',
    category: 'Data Sync & Context',
    name: 'Apple Calendar',
    purpose: 'Sync / Read Context',
    exampleUsage: 'Meetings, travel plans, events',
    status: 'Done',
    priority: 'Tier 1',
    notes: 'Native iOS calendar context',
  },
  {
    id: 'outlook-365',
    category: 'Data Sync & Context',
    name: 'Outlook / Microsoft 365',
    purpose: 'Sync / Read Context',
    exampleUsage: 'Work calendar and relevant email context',
    status: 'Not Started',
    priority: 'Tier 3',
    notes: 'Important for UK enterprise and Microsoft users',
  },
  {
    id: 'device-location',
    category: 'Data Sync & Context',
    name: 'Device Location',
    purpose: 'Sync / Read Context',
    exampleUsage: 'Location and movement context',
    status: 'Done',
    priority: 'Tier 1',
    notes: 'Location and movement context behind most journeys',
    action: {
      label: 'Get current location',
      run: getDeviceLocationSample,
    },
  },
  {
    id: 'contacts',
    category: 'Data Sync & Context',
    name: 'Contacts',
    purpose: 'Sync / Read Context',
    exampleUsage: 'Context for communication and relationships',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'Contact context for communication and relationships',
  },
  {
    id: 'vodafone-profile',
    category: 'Data Sync & Context',
    name: 'Vodafone Profile',
    purpose: 'Sync / Read Context',
    exampleUsage: 'Roaming/network status where permitted',
    status: 'Done',
    priority: 'Tier 1',
    notes: 'Roaming status, plan and network context',
  },
  {
    id: 'uk-open-banking',
    category: 'Data Sync & Context',
    name: 'UK Open Banking',
    purpose: 'Sync / Read Context',
    exampleUsage: 'Financial context with explicit consent',
    status: 'Not Started',
    priority: 'Tier 3',
    notes: 'Partner / Consent Required',
  },

  // --- Identity & Authentication ---
  {
    id: 'camara-number-verification',
    category: 'Identity & Authentication',
    name: 'Vodafone CAMARA Number Verification',
    purpose: 'Intelligence / Signal',
    exampleUsage: 'Passwordless authentication and checkout',
    status: 'Done',
    priority: 'Tier 1',
    notes: "Using Voda mock api's",
  },

  // --- Payments & Commerce ---
  {
    id: 'stripe',
    category: 'Payments & Commerce',
    name: 'Stripe',
    purpose: 'Action / Execute',
    exampleUsage: 'One-tap payments',
    status: 'Done',
    priority: 'Tier 1',
    notes: 'Payment processing and saved-payment flows',
  },
  {
    id: 'paypal',
    category: 'Payments & Commerce',
    name: 'PayPal',
    purpose: 'Action / Execute',
    exampleUsage: 'Wallet-based checkout',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'Alternative checkout and wallet',
  },
  {
    id: 'klarna',
    category: 'Payments & Commerce',
    name: 'Klarna',
    purpose: 'Action / Execute',
    exampleUsage: 'BNPL checkout',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'Consumer financing at checkout',
  },
  {
    id: 'apple-google-pay',
    category: 'Payments & Commerce',
    name: 'Apple Pay / Google Pay',
    purpose: 'Action / Execute',
    exampleUsage: 'One-tap payments',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'One-tap wallet checkout on mobile',
  },

  // --- Travel ---
  {
    id: 'vodafone-roaming-apis',
    category: 'Travel',
    name: 'Vodafone Roaming APIs',
    purpose: 'Intelligence / Signal',
    exampleUsage: 'Detect travel/roaming and recommend plans',
    status: 'Done',
    priority: 'Tier 1',
    notes: 'Detect upcoming trips, roaming and plan eligibility',
  },
  {
    id: 'skyscanner',
    category: 'Travel',
    name: 'Skyscanner',
    purpose: 'Action / Search',
    exampleUsage: 'Flight discovery',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'Flight search and travel options',
  },
  {
    id: 'amadeus',
    category: 'Travel',
    name: 'Amadeus',
    purpose: 'Action / Execute',
    exampleUsage: 'Flight and travel workflows',
    status: 'Not Started',
    priority: 'Tier 3',
    notes: 'Flight and travel inventory',
  },

  // --- Hotels Booking ---
  {
    id: 'booking-com',
    category: 'Hotels Booking',
    name: 'Booking.com',
    purpose: 'Action / Execute',
    exampleUsage: 'Accommodation search and disruption support',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'Hotel search and disruption recovery',
  },
  {
    id: 'trip-com',
    category: 'Hotels Booking',
    name: 'Trip.com',
    purpose: 'Action / Execute',
    exampleUsage: 'Accommodation search and disruption support',
    status: 'Not Started',
    priority: 'Tier 3',
    notes: 'Alternative hotel inventory',
  },

  // --- London Mobility & Transport ---
  {
    id: 'tfl-unified-api',
    category: 'London Mobility & Transport',
    name: 'TfL Unified API',
    purpose: 'Intelligence / Signal',
    exampleUsage: 'Tube, bus, rail status, arrivals and disruptions',
    status: 'Not Started',
    priority: 'Tier 1',
    notes: 'London journey planning, disruptions and arrivals',
  },
  {
    id: 'citymapper',
    category: 'London Mobility & Transport',
    name: 'Citymapper',
    purpose: 'Action / Search',
    exampleUsage: 'Multimodal journey planning',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'Multimodal urban mobility experience',
  },
  {
    id: 'national-rail',
    category: 'London Mobility & Transport',
    name: 'National Rail',
    purpose: 'Intelligence / Signal',
    exampleUsage: 'Train journey and disruption information',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'National rail journey and disruption context',
  },
  {
    id: 'santander-cycles',
    category: 'London Mobility & Transport',
    name: 'Santander Cycles / TfL Data',
    purpose: 'Intelligence / Signal',
    exampleUsage: 'Bike availability and last-mile travel',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'Cycle availability and last-mile options',
  },

  // --- Ride Share ---
  {
    id: 'uber',
    category: 'Ride Share',
    name: 'Uber',
    purpose: 'Action / Execute',
    exampleUsage: 'Book or manage rides',
    status: 'Done',
    priority: 'Tier 1',
    notes: 'Request and manage rides; validate commercial onboarding',
  },
  {
    id: 'lyft',
    category: 'Ride Share',
    name: 'Lyft',
    purpose: 'Action / Execute',
    exampleUsage: 'Book or manage rides',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'No UK coverage; not planned for POC',
  },
  {
    id: 'black-cabs',
    category: 'Ride Share',
    name: 'Black cabs',
    purpose: '',
    exampleUsage: '',
    status: 'Not Started',
    notes: 'Licensed taxi options via a UK supplier',
  },

  // --- Maps & Location ---
  {
    id: 'google-maps',
    category: 'Maps & Location',
    name: 'Google Maps',
    purpose: 'Intelligence / Signal + Action',
    exampleUsage: 'ETA, routing and places',
    status: 'Not Started',
    priority: 'Tier 1',
    notes: 'Routing, ETA, geocoding and places',
  },

  // --- Weather & Environment ---
  {
    id: 'apple-weather',
    category: 'Weather & Environment',
    name: 'Apple weather',
    purpose: 'Intelligence / Signal',
    exampleUsage: 'UK weather-based recommendations',
    status: 'Done',
    priority: 'Tier 1',
    notes: 'UK weather-driven commute and travel alerts',
  },

  // --- Messaging & Notifications ---
  {
    id: 'fcm',
    category: 'Messaging & Notifications',
    name: 'Firebase Cloud Messaging',
    purpose: 'Action / Execute',
    exampleUsage: 'Proactive Android notifications',
    status: 'Not Started',
    priority: 'Tier 1',
    notes: 'Cross-platform proactive alerts',
  },
  {
    id: 'apns',
    category: 'Messaging & Notifications',
    name: 'Apple Push Notifications',
    purpose: 'Action / Execute',
    exampleUsage: 'Proactive iOS notifications',
    status: 'Not Started',
    priority: 'Tier 1',
    notes: 'iOS notification delivery',
  },
  {
    id: 'whatsapp',
    category: 'Messaging & Notifications',
    name: 'WhatsApp',
    purpose: 'Action / Execute',
    exampleUsage: 'Approved business messaging and notifications',
    status: 'Done',
    priority: 'Tier 2',
    notes: 'Outbound notifications and support; not general access to personal WhatsApp chats',
    action: {
      label: `Send test message to ${VEDA_CONTACT.name}`,
      run: async () => {
        const text = "Hi! This is a test message from Veda's integrations catalog.";
        await shareToWhatsApp(VEDA_CONTACT.phoneNumberE164, text);
        return { summary: `Opened WhatsApp to ${VEDA_CONTACT.name} (${VEDA_CONTACT.phoneNumberE164}) with a prefilled test message.` };
      },
    },
  },
  {
    id: 'twilio',
    category: 'Messaging & Notifications',
    name: 'Twilio',
    purpose: 'Action / Execute',
    exampleUsage: 'SMS and communication fallback',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'Fallback communications and verified notification flows',
  },
  {
    id: 'gmail-send',
    category: 'Messaging & Notifications',
    name: 'Gmail',
    purpose: 'Action / Execute',
    exampleUsage: 'Send emails via veda',
    status: 'Done',
    priority: 'Tier 1',
    notes: 'Outbound email actions with user confirmation',
  },

  // --- Food & Grocery ---
  {
    id: 'uber-eats',
    category: 'Food & Grocery',
    name: 'Uber Eats',
    purpose: 'Action / Execute',
    exampleUsage: 'Food recommendations and ordering/handoff',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'Food discovery and order handoff; direct ordering depends on partnership',
  },
  {
    id: 'deliveroo',
    category: 'Food & Grocery',
    name: 'Deliveroo',
    purpose: 'Action / Execute',
    exampleUsage: 'UK food delivery',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'https://developers.deliveroo.com/get-started',
  },
  {
    id: 'opentable',
    category: 'Food & Grocery',
    name: 'OpenTable',
    purpose: 'Action / Execute',
    exampleUsage: 'Food ordering ecosystem',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'https://docs.opentable.com/',
  },

  // --- Family & Safety ---
  {
    id: 'device-location-geofencing',
    category: 'Family & Safety',
    name: 'Device Location / Geofencing',
    purpose: 'Sync + Intelligence',
    exampleUsage: 'Safety alerts and location-based automation',
    status: 'In Progress',
    priority: 'Tier 2',
    notes: 'Geofencing and safety use cases with explicit consent',
  },
  {
    id: 'vodafone-family-services',
    category: 'Family & Safety',
    name: 'Vodafone Family Services',
    purpose: 'Intelligence / Signal',
    exampleUsage: 'Family safety capabilities',
    status: 'Not Started',
    priority: 'Tier 2',
    notes: 'Family safety and parental control capabilities',
  },

  // --- Smart Home & Energy ---
  {
    id: 'google-home-nest',
    category: 'Smart Home & Energy',
    name: 'Google Home / Nest',
    purpose: 'Action / Execute',
    exampleUsage: 'Home automation',
    status: 'Not Started',
    priority: 'Tier 3',
    notes: 'Contextual home automation',
  },
  {
    id: 'hive-tado',
    category: 'Smart Home & Energy',
    name: 'Hive / Tado',
    purpose: 'Action / Execute',
    exampleUsage: 'UK home heating automation',
    status: 'Not Started',
    priority: 'Tier 3',
    notes: 'UK home heating optimization',
  },

  // --- Subscriptions & Vodafone Account ---
  {
    id: 'vodafone-account-billing',
    category: 'Subscriptions & Vodafone Account',
    name: 'Vodafone Account / Billing',
    purpose: 'Sync + Action',
    exampleUsage: 'Manage plan, bill and services',
    status: 'Done',
    priority: 'Tier 2',
    notes: 'Plan, bill and subscription management',
  },
  {
    id: 'spotify',
    category: 'Subscriptions & Vodafone Account',
    name: 'Spotify',
    purpose: 'Action / Execute',
    exampleUsage: 'Subscription discovery and management',
    status: 'Not Started',
    priority: 'Tier 3',
    notes: 'Subscription visibility where platform permissions allow',
  },
  {
    id: 'netflix',
    category: 'Subscriptions & Vodafone Account',
    name: 'Netflix',
    purpose: 'Action / Execute',
    exampleUsage: 'Subscription discovery and management',
    status: 'Not Started',
    priority: 'Tier 3',
    notes: 'No public account API; user-declared subscriptions only',
  },
  {
    id: 'disney-plus',
    category: 'Subscriptions & Vodafone Account',
    name: 'Disney+',
    purpose: 'Action / Execute',
    exampleUsage: 'Subscription discovery and management',
    status: 'Not Started',
    priority: 'Tier 3',
    notes: 'No public account API; user-declared subscriptions only',
  },

  // --- AI & Agent Platform ---
  {
    id: 'llm-agent-platform',
    category: 'AI & Agent Platform',
    name: 'LLM / Agent Platform',
    purpose: 'Intelligence',
    exampleUsage: 'Reasoning, orchestration and recommendations',
    status: 'Done',
    priority: 'Foundation',
    notes: 'Agent reasoning and orchestration; select according to enterprise policy',
  },
  {
    id: 'user-context-store',
    category: 'AI & Agent Platform',
    name: 'User Context Store',
    purpose: 'Sync / Intelligence',
    exampleUsage: 'Unified user profile and contextual memory',
    status: 'Done',
    priority: 'Foundation',
    notes: 'User profiles, consent records and contextual memory',
  },
  {
    id: 'llm-chat-interface',
    category: 'AI & Agent Platform',
    name: 'LLM based Chat interface',
    purpose: 'Sync / Intelligence',
    exampleUsage: 'LLM based Chat interface',
    status: 'Done',
    priority: 'Foundation',
    notes: 'Primary conversational surface for the companion',
  },
];
