import { Button, ContentState, MessagePart, Spinner } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { MessageListItem } from '@/frontend/components/Message';

import { useMessageUsageRecords } from '../hooks/useMessageUsageRecords';
import { formatMessageUsageCost, getMessageUsageDetails } from '../utils/messageUsage';

const DETAIL_SIZES = ['compact', 'large'] as const;

export function MessageUsageDetail({
  message,
  onClose,
}: {
  message: MessageListItem;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { error, isLoading, records, refresh } = useMessageUsageRecords(message.id);
  const detail = getMessageUsageDetails(message.stats, records, message.model);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const numbers = new Intl.NumberFormat(locale);
  const decimals = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const seconds = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'second',
    maximumFractionDigits: 2,
  });
  const unavailable = t('chat.messageUsage.unavailable');
  const formatTokens = (value: number | undefined) =>
    value === undefined ? unavailable : numbers.format(value);
  const formatSpeed = (value: number | undefined) =>
    value === undefined
      ? undefined
      : t('chat.messageUsage.speedValue', { value: decimals.format(value) });
  const formatDuration = (value: number | undefined) =>
    value === undefined ? undefined : seconds.format(value / 1000);
  const createdAt = message.createdAt ? new Date(message.createdAt) : undefined;
  const metadata = {
    ...(detail.requestCount !== undefined
      ? {
          [t('chat.messageUsage.requests')]: numbers.format(detail.requestCount),
        }
      : {}),
    ...(message.model
      ? {
          [t('chat.messageUsage.model')]: message.model.name,
          [t('chat.messageUsage.provider')]:
            records.find((record) => record.providerId === message.model?.providerId)
              ?.providerName ?? message.model.providerId,
        }
      : {}),
    ...(createdAt && Number.isFinite(createdAt.getTime())
      ? {
          [t('chat.messageUsage.createdAt')]: new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'medium',
          }).format(createdAt),
        }
      : {}),
  };
  const tokenDetails = [
    ['chat.messageUsage.noCache', detail.noCacheTokens],
    ['chat.messageUsage.cacheRead', detail.cacheReadTokens],
    ['chat.messageUsage.cacheWrite', detail.cacheWriteTokens],
    ['chat.messageUsage.reasoning', detail.reasoningTokens],
  ] as const;
  const performance = [
    ['chat.messageUsage.totalDuration', formatDuration(detail.durationMs)],
    ['chat.messageUsage.firstToken', formatDuration(detail.firstTokenMs)],
    ['chat.messageUsage.modelSpeed', formatSpeed(detail.modelTokensPerSecond)],
    ['chat.messageUsage.totalSpeed', formatSpeed(detail.endToEndTokensPerSecond)],
    ['chat.messageUsage.toolDuration', formatDuration(detail.toolDurationMs)],
    ['chat.messageUsage.approvalDuration', formatDuration(detail.approvalDurationMs)],
  ] as const;

  return (
    <MessagePart.Detail
      onClose={onClose}
      sizes={DETAIL_SIZES}
      testID="message-usage-detail"
      title={t('chat.messageUsage.title')}
    >
      <MessagePart.ValueSection title={t('chat.messageUsage.message')} value={metadata} />
      <MessagePart.ValueSection
        title={t('chat.messageUsage.tokens')}
        value={{
          [t('chat.messageUsage.input')]: formatTokens(detail.inputTokens),
          [t('chat.messageUsage.output')]: formatTokens(detail.outputTokens),
          [t('chat.messageUsage.total')]: formatTokens(detail.totalTokens),
          ...Object.fromEntries(
            tokenDetails
              .filter(([, value]) => value !== undefined)
              .map(([key, value]) => [t(key), formatTokens(value)]),
          ),
        }}
      />
      <MessagePart.ValueSection
        title={t('chat.messageUsage.performance')}
        value={Object.fromEntries(
          performance
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [t(key), value]),
        )}
      />
      <Text className="text-muted-foreground text-xs">{t('chat.messageUsage.durationHint')}</Text>
      <View className="gap-2">
        <MessagePart.SectionTitle title={t('chat.messageUsage.cost')} />
        {detail.costs.map((cost) => {
          const sourceKey =
            cost.providerReportedRequestCount > 0
              ? cost.computedRequestCount > 0
                ? 'chat.messageUsage.costMixed'
                : 'chat.messageUsage.costBilled'
              : cost.computedRequestCount > 0
                ? 'chat.messageUsage.costEstimated'
                : 'chat.messageUsage.cost';
          return (
            <View
              className="flex-row flex-wrap items-center justify-between gap-2"
              key={cost.currency}
            >
              <Text className="text-muted-foreground text-sm">
                {t(sourceKey)} ({cost.currency})
              </Text>
              <Text className="text-foreground text-sm tabular-nums" selectable>
                {formatMessageUsageCost(cost.amount, cost.currency, locale)}
              </Text>
            </View>
          );
        })}
        {!isLoading && !error && detail.costs.length === 0 ? (
          <Text className="text-muted-foreground text-sm">{unavailable}</Text>
        ) : null}
        {detail.hasUnpricedRecords && detail.costs.length > 0 ? (
          <Text className="text-muted-foreground text-xs">
            {t('chat.messageUsage.partialCost')}
          </Text>
        ) : null}
      </View>
      {error ? (
        <ContentState.Error
          primaryAction={{
            children: t('common.retry'),
            onPress: () => {
              void refresh();
            },
          }}
          title={t('chat.messageUsage.loadError')}
        />
      ) : isLoading ? (
        <Spinner accessibilityLabel={t('chat.messageUsage.loading')} size="sm" />
      ) : records.length === 0 ? (
        <View className="gap-1">
          <Text className="text-muted-foreground text-xs">{t('chat.messageUsage.noRecords')}</Text>
          <Button
            onPress={() => {
              void refresh();
            }}
            size="sm"
            variant="ghost"
          >
            {t('common.retry')}
          </Button>
        </View>
      ) : null}
    </MessagePart.Detail>
  );
}
