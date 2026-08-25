import { memo } from 'react';

import type { ChatItem } from '../../types';
import ConfirmationPrompt from './ConfirmationPrompt';
import HotelBookingCard from '../common/HotelBookingCard';
import MessageBubble from './MessageBubble';
import ReceiptCard from './ReceiptCard';
import RecommendationCard from './RecommendationCard';
import StatusLine from './StatusLine';
import TravelInsuranceCardChat from './TravelInsuranceCardChat';

type Props = {
  item: ChatItem;
  onConfirm: (actionId: string) => void;
  onDecline: (actionId: string) => void;
  onInsurancePurchased?: (data: any) => void;
};

function ChatItemViewImpl({ item, onConfirm, onDecline, onInsurancePurchased }: Props) {
  switch (item.kind) {
    case 'text':
      return <MessageBubble text={item.text} tone={item.role} />;
    case 'status':
      return <StatusLine label={item.label} state={item.state} />;
    case 'card':
      return <RecommendationCard card={item.card} />;
    case 'hotel':
      return (
        <HotelBookingCard
          hotel={item.hotel.hotel}
          suggestion={item.hotel.suggestion}
          recommendations={item.hotel.recommendations}
        />
      );
    case 'travel_insurance':
      return <TravelInsuranceCardChat plan={item.plan} calendarEventId={item.calendarEventId} onInsurancePurchased={onInsurancePurchased} />;
    case 'confirmation':
      return <ConfirmationPrompt item={item} onConfirm={onConfirm} onDecline={onDecline} />;
    case 'receipt':
      return <ReceiptCard subscription={item.subscription} planName={item.planName} />;
    case 'error':
      return <MessageBubble text={item.message} tone="error" />;
    default: {
      const _exhaustive: never = item;
      return _exhaustive;
    }
  }
}

export default memo(ChatItemViewImpl);
