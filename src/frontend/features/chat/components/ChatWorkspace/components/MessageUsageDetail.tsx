import { Button, ContentState, Spinner } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { AiUsageDetail } from '@/frontend/components/AiUsageDetail';
import type { MessageListItem } from '@/frontend/components/Message';
import type { MessageUsageSummary } from '@/shared/contracts/messageUsage';

import { useMessageUsageRecords } from '../hooks/useMessageUsageRecords';
import { getMessageUsageDetails } from '../utils/messageUsage';

export function MessageUsageDetail({
  message,
  onClose,
  detail,
  providerName,
  children,
}: {
  message: MessageListItem;
  onClose: () => void;
  detail: MessageUsageSummary;
  providerName?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <AiUsageDetail
      model={message.model}
      createdAt={message.createdAt}
      detail={detail}
      providerName={providerName}
      onClose={onClose}
      testID="message-usage-detail"
      title={t('chat.messageUsage.title')}
    >
      {children}
    </AiUsageDetail>
  );
}

/** Only the local owner reads the local accounting ledger. */
export function LocalMessageUsageDetail({
  message,
  onClose,
}: {
  message: MessageListItem;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { error, isLoading, records, refresh } = useMessageUsageRecords(message.id);
  const detail = getMessageUsageDetails(message.stats, records, message.model);
  const providerName = message.model
    ? (records.find((record) => record.providerId === message.model?.providerId)?.providerName ??
      message.model.providerId)
    : undefined;
  return (
    <MessageUsageDetail
      message={message}
      detail={detail}
      providerName={providerName}
      onClose={onClose}
    >
      {error ? (
        <ContentState.Error
          primaryAction={{ children: t('common.retry'), onPress: () => void refresh() }}
          title={t('chat.messageUsage.loadError')}
        />
      ) : isLoading ? (
        <View className="flex-row items-center gap-2">
          <Spinner accessibilityLabel={t('chat.messageUsage.loading')} size="sm" />
          <Text className="text-muted-foreground text-xs">{t('chat.messageUsage.loading')}</Text>
        </View>
      ) : records.length === 0 ? (
        <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Text className="min-w-0 shrink text-muted-foreground text-xs">
            {t('chat.messageUsage.noRecords')}
          </Text>
          <Button onPress={() => void refresh()} size="inline" variant="ghost">
            <Text className="font-medium text-foreground text-xs">{t('common.retry')}</Text>
          </Button>
        </View>
      ) : null}
    </MessageUsageDetail>
  );
}
