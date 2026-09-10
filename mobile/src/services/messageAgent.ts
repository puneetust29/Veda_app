/**
 * Message Agent Service
 * Generates dynamic, customized messages for various trip-related scenarios.
 * Supports multiple message types, tones, and can be extended for different channels.
 */

import { getMessageTemplate, type MessageTone, type MessageType } from '../config/messageTemplates';
import type { GeneratedMessage, MessageGeneratorOptions, TripData } from '../types/message';

class MessageAgent {
  /**
   * Generate a customized message from a template
   * @param options Configuration for message generation
   * @returns Generated message object
   */
  generateMessage(options: MessageGeneratorOptions): GeneratedMessage {
    const { type, tone, contactName, tripData } = options;

    // Get template for the specified type and tone
    const template = getMessageTemplate(type, tone);

    if (!template) {
      throw new Error(`No template found for type="${type}" and tone="${tone}"`);
    }

    // Fill template with trip data and contact name
    const text = this.fillTemplate(template, contactName, tripData);

    return {
      text,
      type,
      tone,
      contactName,
      createdAt: new Date(),
    };
  }

  /**
   * Replace placeholders in template with actual data
   * @param template Template string with placeholders
   * @param contactName Name of the contact receiving the message
   * @param tripData Trip information
   * @returns Filled message string
   */
  private fillTemplate(template: string, contactName: string, tripData: TripData): string {
    let text = template;

    // Replace all placeholders
    text = text.replace(/{contactName}/g, contactName);
    text = text.replace(/{travelerName}/g, tripData.travelerName);
    text = text.replace(/{destination}/g, tripData.destination);
    text = text.replace(/{startDate}/g, tripData.startDate);
    text = text.replace(/{endDate}/g, tripData.endDate);
    text = text.replace(/{travelers}/g, tripData.travelers);
    text = text.replace(/{hotelInfo}/g, tripData.hotelInfo || 'N/A');
    text = text.replace(/{emergencyContact}/g, tripData.emergencyContact || 'N/A');
    text = text.replace(/{backupContact}/g, tripData.backupContact || 'N/A');
    text = text.replace(/{currentDate}/g, tripData.currentDate || new Date().toLocaleDateString());

    return text;
  }

  /**
   * Generate messages for multiple contacts with same trip data
   * Useful for bulk message generation for WhatsApp/Email
   * @param contactsAndTones Array of {name, type, tone} for each contact
   * @param tripData Common trip data for all messages
   * @returns Array of generated messages
   */
  generateBulkMessages(
    contactsAndTones: Array<{ name: string; type: MessageType; tone: MessageTone }>,
    tripData: TripData,
  ): GeneratedMessage[] {
    return contactsAndTones.map((contact) =>
      this.generateMessage({
        type: contact.type,
        tone: contact.tone,
        contactName: contact.name,
        tripData,
      }),
    );
  }

  /**
   * Get recommended message type and tone based on contact relationship
   * Can be extended to use AI/ML in the future
   * @param contactType Type of contact (emergency, friend, family, business, etc.)
   * @returns Recommended {type, tone}
   */
  getRecommendedMessageStyle(
    contactType: 'emergency' | 'friend' | 'family' | 'business' | 'colleague',
  ): { type: MessageType; tone: MessageTone } {
    const recommendations: Record<
      string,
      { type: MessageType; tone: MessageTone }
    > = {
      emergency: { type: 'emergency_alert', tone: 'urgent' },
      friend: { type: 'trip_notification', tone: 'informal' },
      family: { type: 'trip_notification', tone: 'friendly' },
      business: { type: 'formal_notice', tone: 'formal' },
      colleague: { type: 'trip_notification', tone: 'formal' },
    };

    return recommendations[contactType] || { type: 'trip_notification', tone: 'informal' };
  }
}

// Export singleton instance
export const messageAgent = new MessageAgent();

export default messageAgent;
