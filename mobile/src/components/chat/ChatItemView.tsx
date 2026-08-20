import { memo } from 'react';

import type { ChatItem } from '../../types';
import ConfirmationPrompt from './ConfirmationPrompt';
import MessageBubble from './MessageBubble';
import ReceiptCard from './ReceiptCard';
import RecommendationCard from './RecommendationCard';
import StatusLine from './StatusLine';

type Props = {
  item: ChatItem;
  onConfirm: (actionId: string) => void;
  onDecline: (actionId: string) => void;
};

function ChatItemViewImpl({ item, onConfirm, onDecline }: Props) {
  switch (item.kind) {
    case 'text':
      return <MessageBubble text={item.text} tone={item.role} />;
    case 'status':
      return <StatusLine label={item.label} state={item.state} />;
    case 'card':
      return <RecommendationCard card={item.card} />;
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
