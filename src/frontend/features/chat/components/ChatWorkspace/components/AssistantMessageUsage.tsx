import InfoIcon from '@cherrystudio/app-icons/icons/info';
import { Button } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { MessageListItem } from '@/frontend/components/Message';

import { getMessageDurationMs, getMessageTokenUsage } from '../utils/messageUsage';
import { MessageUsageDetail } from './MessageUsageDetail';

export function AssistantMessageUsage({ message }: { message: MessageListItem }) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  if (message.status === 'pending') return null;

  const locale = i18n.resolvedLanguage;
  const { totalTokens } = getMessageTokenUsage(message.stats);
  const durationMs = getMessageDurationMs(message.stats);
  const tokens =
    totalTokens === undefined
      ? undefined
      : t('chat.messageUsage.tokensValue', {
          value: new Intl.NumberFormat(locale, {
            notation: 'compact',
            maximumFractionDigits: 1,
          }).format(totalTokens),
        });
  const duration =
    durationMs === undefined
      ? undefined
      : new Intl.NumberFormat(locale, {
          style: 'unit',
          unit: 'second',
          maximumFractionDigits: 1,
        }).format(durationMs / 1000);
  const summary = [tokens, duration].filter(Boolean).join(' · ') || t('chat.messageUsage.title');

  return (
    <>
      <Button
        accessibilityLabel={summary}
        accessibilityHint={t('chat.messageUsage.openHint')}
        hitSlop={6}
        icon={<InfoIcon className="text-muted-foreground" size={14} />}
        onPress={() => setIsOpen(true)}
        size="sm"
        testID="assistant-message-usage"
        variant="ghost"
      >
        <Text className="shrink text-muted-foreground text-xs tabular-nums">{summary}</Text>
      </Button>
      {isOpen ? <MessageUsageDetail message={message} onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}
