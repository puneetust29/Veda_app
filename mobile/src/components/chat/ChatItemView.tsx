import { memo } from 'react';

import type { ChatItem } from '../../types';
import ConfirmationPrompt from './ConfirmationPrompt';
import ConfirmationSuccessCard from './ConfirmationSuccessCard';
import HotelBookingCard from '../common/HotelBookingCard';
import MessageBubble from './MessageBubble';
import PaymentCompleteCard from './PaymentCompleteCard';
import RecommendationCard from './RecommendationCard';
import StatusLine from './StatusLine';
import WhatsAppShareCard from './WhatsAppShareCard';
import TravelInsuranceCardChat from './TravelInsuranceCardChat';
import TripPreparationCard from './TripPreparationCard';
import TripChecklistCard from './TripChecklistCard';


type Props = {
  item: ChatItem;
  onConfirm?: (actionId: string) => void;
  onDecline?: (actionId: string) => void;
  onInsurancePurchased?: (data: any) => void;
  onContinuePrep?: () => void;
  continuePrepLoading?: boolean;
  nextItem?: ChatItem;
};

function ChatItemViewImpl({ item, onConfirm, onDecline, onInsurancePurchased, onContinuePrep, continuePrepLoading, nextItem }: Props) {
  switch (item.kind) {
    case 'text':
      return <MessageBubble text={item.text} tone={item.role} />;
    case 'status':
      return <StatusLine label={item.label} state={item.state} />;
    case 'trip_preparation':
      return (
        <TripPreparationCard
          event={item.event}
          returnFlightDate={item.returnFlightDate}
          hasFlightBooking={item.hasFlightBooking}
          hasHotelBooking={item.hasHotelBooking}
          hasRoamingActive={item.hasRoamingActive}
          hasInsuranceActive={item.hasInsuranceActive}
          loading={continuePrepLoading}
          onContinue={() => onContinuePrep?.()}
        />
      );
    case 'card':
      if (item.card.kind === 'uber_ride') return null; // dev-only
      return (
        <RecommendationCard
          card={item.card}
          confirmation={nextItem?.kind === 'confirmation' ? nextItem : undefined}
          onConfirm={onConfirm}
          onDecline={onDecline}
        />
      );
    case 'hotel':
      return (
        <HotelBookingCard
          hotel={item.hotel.hotel}
          suggestion={item.hotel.suggestion}
          recommendations={item.hotel.recommendations}
        />
      );
    case 'transport':
    case 'maps':
      return null; // dev-only — rendered in Integration (Dev) screens only
    case 'whatsapp_share':
      return <WhatsAppShareCard text={item.text} />;
    case 'travel_insurance':
      return (
        <TravelInsuranceCardChat
          plan={item.plan}
          calendarEventId={item.calendarEventId}
          onInsurancePurchased={onInsurancePurchased}
        />
      );
    case 'confirmation':
      return <ConfirmationPrompt item={item} onConfirm={onConfirm!} onDecline={onDecline!} />;
    case 'receipt':
      return null; // Don't show receipt cards in chat
    case 'confirmation_success':
      return <ConfirmationSuccessCard planType={item.planType} />;
    case 'payment_complete':
      return (
        <PaymentCompleteCard
          insuranceId={item.insuranceId}
          insuranceAmount={item.insuranceAmount}
          insuranceCurrency={item.insuranceCurrency}
          destination={item.destination}
          cardBrand={item.cardBrand}
          cardLast4={item.cardLast4}
        />
      );
    case 'trip_checklist':
      return <TripChecklistCard destination={item.destination} />;
    case 'error':
      return <MessageBubble text={item.message} tone="error" />;
    default: {
      const _exhaustive: never = item;
      return _exhaustive;
    }
  }
}

export default memo(ChatItemViewImpl);
