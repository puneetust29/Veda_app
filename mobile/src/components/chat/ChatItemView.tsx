import { memo } from 'react';
import { View } from 'react-native';

import type { ChatItem } from '../../types';
import type { ViewMode, PlanState } from '../../hooks/useRoamingChat';
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
  currentView?: ViewMode;
  onSwitchView?: (view: ViewMode) => void;
  planState?: PlanState;
};

function ChatItemViewImpl({ item, onConfirm, onDecline, onInsurancePurchased, currentView = 'roaming' }: Props) {
  switch (item.kind) {
    case 'text':
      return <MessageBubble text={item.text} tone={item.role} />;
    case 'status':
      return <StatusLine label={item.label} state={item.state} />;
    case 'card':
      // Hide if currentView is not roaming (whether toggle visible or not)
      if (currentView !== 'roaming') return <View />;
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
      // Hide if currentView is not insurance (whether toggle visible or not)
      if (currentView !== 'insurance') return <View />;
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
