import type { MessageType, MessageTone } from '../config/messageTemplates';

export interface TripData {
  travelerName: string;
  destination: string;
  startDate: string; 
  endDate: string; 
  travelers: string; 
  hotelInfo?: string;
  emergencyContact?: string;
  backupContact?: string;
  currentDate?: string;
}

export interface MessageGeneratorOptions {
  type: MessageType;
  tone: MessageTone;
  contactName: string;
  tripData: TripData;
}

export interface GeneratedMessage {
  text: string;
  type: MessageType;
  tone: MessageTone;
  contactName: string;
  createdAt: Date;
}

export interface MessageTemplate {
  type: MessageType;
  tone: MessageTone;
  template: string;
  description: string;
}
