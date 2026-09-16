/**
 * Message templates for different scenarios, tones, and message types.
 * Used by messageAgent to generate dynamic messages for various channels.
 */

export type MessageType = 'trip_notification' | 'emergency_alert' | 'request_favor' | 'casual_update' | 'formal_notice';
export type MessageTone = 'formal' | 'informal' | 'urgent' | 'friendly';

export interface MessageTemplate {
  type: MessageType;
  tone: MessageTone;
  template: string;
  description: string;
}

const MESSAGE_TEMPLATES: MessageTemplate[] = [
  // Trip Notifications
  {
    type: 'trip_notification',
    tone: 'formal',
    template: 'Dear {contactName},\n\nI am writing to inform you that I will be traveling to {destination} from {startDate} to {endDate}. During this period, I will have limited availability.\n\nTrip Details:\n- Destination: {destination}\n- Duration: {startDate} to {endDate}\n- Travelers: {travelers}\n\nI will be reachable via email for urgent matters.\n\nBest regards,\n{travelerName}',
    description: 'Formal trip notification for professional contacts',
  },
  {
    type: 'trip_notification',
    tone: 'informal',
    template: 'Hey {contactName}!\n\nJust wanted to let you know I\'m heading to {destination} from {startDate} to {endDate}. I\'ll be traveling with {travelers}.\n\nI\'ll catch up with you when I\'m back! 🌍',
    description: 'Casual trip notification for friends',
  },
  {
    type: 'trip_notification',
    tone: 'friendly',
    template: 'Hi {contactName},\n\n{travelerName} is traveling to {destination} from {startDate} to {endDate}.\n\nTrip Details:\n✈️ Destination: {destination}\n📅 Dates: {startDate} - {endDate}\n👥 Traveling with: {travelers}\n\nLooking forward to sharing stories when back! 😊',
    description: 'Friendly trip notification with emojis',
  },

  // Emergency Alerts
  {
    type: 'emergency_alert',
    tone: 'urgent',
    template: 'IMPORTANT: {travelerName} will be traveling to {destination} from {startDate} to {endDate}.\n\nIn case of emergency, please:\n1. Contact via: {emergencyContact}\n2. Backup contact: {backupContact}\n3. Hotel: {hotelInfo}\n\nPlease keep this information handy.',
    description: 'Urgent emergency alert with critical contact information',
  },
  {
    type: 'emergency_alert',
    tone: 'formal',
    template: 'I am traveling to {destination} from {startDate} to {endDate}.\n\nEmergency Contact Information:\n- Primary: {emergencyContact}\n- Secondary: {backupContact}\n- Location: {destination}\n- Accommodation: {hotelInfo}\n\nPlease keep this for your records.',
    description: 'Formal emergency alert for official records',
  },

  // Request for Favor
  {
    type: 'request_favor',
    tone: 'informal',
    template: 'Hey {contactName},\n\nI\'m heading to {destination} from {startDate} to {endDate}. Do you mind keeping an eye on things while I\'m away? 🙏\n\nWould appreciate it!\n\nThanks,\n{travelerName}',
    description: 'Casual request for favor while traveling',
  },
  {
    type: 'request_favor',
    tone: 'formal',
    template: 'Dear {contactName},\n\nI will be traveling to {destination} during {startDate} to {endDate}. I would appreciate your assistance with the following during my absence:\n\n[Add specific requests]\n\nThank you for your help.\n\nBest regards,\n{travelerName}',
    description: 'Formal request for specific assistance',
  },

  // Casual Updates
  {
    type: 'casual_update',
    tone: 'friendly',
    template: 'Hey {contactName}! 👋\n\n{travelerName} is off to {destination}! 🎉\n\nDates: {startDate} to {endDate}\n\nWill catch up soon! ✈️',
    description: 'Quick casual update for social sharing',
  },
  {
    type: 'casual_update',
    tone: 'informal',
    template: 'Just a heads up - I\'m going to {destination} from {startDate} to {endDate}. Talk soon!',
    description: 'Brief informal update',
  },

  // Formal Notice
  {
    type: 'formal_notice',
    tone: 'formal',
    template: 'TRAVEL NOTICE\n\nTraveler: {travelerName}\nDestination: {destination}\nDates: {startDate} to {endDate}\nNumber of Travelers: {travelers}\n\nThis is to notify that the above mentioned individual(s) will be traveling during the specified period.\n\nFor any urgent matters, please contact: {emergencyContact}\n\nDate: {currentDate}\nSignature: {travelerName}',
    description: 'Formal official travel notice',
  },
];

export const getMessageTemplate = (type: MessageType, tone: MessageTone): string | null => {
  const template = MESSAGE_TEMPLATES.find((t) => t.type === type && t.tone === tone);
  return template?.template ?? null;
};

export const getAvailableTemplates = (type: MessageType): MessageTone[] => {
  return MESSAGE_TEMPLATES.filter((t) => t.type === type).map((t) => t.tone);
};

export default MESSAGE_TEMPLATES;
