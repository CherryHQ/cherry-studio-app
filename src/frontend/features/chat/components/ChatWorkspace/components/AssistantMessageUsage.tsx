import { Button } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { MessageListItem } from '@/frontend/components/Message';

import { getMessageDurationMs, getMessageTokenUsage } from '../utils/messageUsage';
import { MessageUsageDetail } from './MessageUsageDetail';

// Keep the compact unit consistent across UI languages (27k instead of 2.7万).
const TOKEN_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function AssistantMessageUsage({ message }: { message: MessageListItem }) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  if (message.status === 'pending') return null;

  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { totalTokens } = getMessageTokenUsage(message.stats);
  const durationMs = getMessageDurationMs(message.stats);
  const tokens =
    totalTokens === undefined
      ? undefined
      : t('chat.messageUsage.tokensValue', {
          value: TOKEN_NUMBER_FORMATTER.format(totalTokens).replace('K', 'k'),
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
        hitSlop={9}
        onPress={() => setIsOpen(true)}
        size="inline"
        testID="assistant-message-usage"
        variant="ghost"
      >
        <Text className="min-w-0 shrink text-muted-foreground text-xs tabular-nums">{summary}</Text>
      </Button>
      {isOpen ? <MessageUsageDetail message={message} onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}
