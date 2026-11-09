import { MessagePart } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ModelAvatar } from '@/frontend/components/Avatar';
import { formatAiUsageCost } from '@/frontend/utils/aiUsage';
import type { MessageUsageSummary } from '@/shared/contracts/messageUsage';
import type { Model } from '@/shared/data/types/model';

const DETAIL_SIZES = ['medium', 'large', 'full'] as const;

export function AiUsageDetail({
  model,
  createdAt,
  title,
  testID,
  costDetails,
  onClose,
  detail,
  providerName,
  children,
}: {
  model?: Pick<Model, 'id' | 'modelId' | 'name' | 'providerId'>;
  createdAt?: string;
  title: string;
  testID?: string;
  costDetails?: ReactNode;
  onClose: () => void;
  detail: MessageUsageSummary & { imageCount?: number; thinkingMs?: number };
  providerName?: string;
  children?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const date = createdAt ? new Date(createdAt) : undefined;
  const formattedCreatedAt =
    date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(date)
      : undefined;
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
  const tokenSum =
    detail.inputTokens !== undefined && detail.outputTokens !== undefined
      ? detail.inputTokens + detail.outputTokens
      : 0;
  const hasTokenDistribution = Number.isFinite(tokenSum) && tokenSum > 0;
  const inputDetails = [
    ['chat.messageUsage.noCache', detail.noCacheTokens],
    ['chat.messageUsage.cacheRead', detail.cacheReadTokens],
    ['chat.messageUsage.cacheWrite', detail.cacheWriteTokens],
  ] as const;
  const performance = [
    ['chat.messageUsage.totalDuration', formatDuration(detail.durationMs)],
    ['chat.messageUsage.firstToken', formatDuration(detail.firstTokenMs)],
    ['aiUsage.thinking', formatDuration(detail.thinkingMs)],
    ['chat.messageUsage.modelSpeed', formatSpeed(detail.modelTokensPerSecond)],
    ['chat.messageUsage.totalSpeed', formatSpeed(detail.endToEndTokensPerSecond)],
    ['chat.messageUsage.toolDuration', formatDuration(detail.toolDurationMs)],
    ['chat.messageUsage.approvalDuration', formatDuration(detail.approvalDurationMs)],
  ] as const;
  const visiblePerformance = performance.filter(([, value]) => value !== undefined);

  return (
    <MessagePart.Detail onClose={onClose} sizes={DETAIL_SIZES} testID={testID} title={title}>
      <View className="gap-8">
        <View className="gap-6">
          {model ? (
            <View className="flex-row items-center gap-2.5">
              <ModelAvatar model={model} size={28} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="font-medium text-foreground text-sm" selectable>
                  {model.name}
                </Text>
                <Text className="text-muted-foreground text-xs" selectable>
                  {providerName}
                </Text>
              </View>
            </View>
          ) : null}
          <View className="gap-1">
            <Text className="text-muted-foreground text-sm">
              {t('chat.messageUsage.totalTokens')}
            </Text>
            <Text
              adjustsFontSizeToFit
              className="font-semibold text-4xl text-foreground tabular-nums"
              minimumFontScale={0.6}
              numberOfLines={1}
              selectable
            >
              {detail.totalTokens === undefined ? '—' : numbers.format(detail.totalTokens)}
            </Text>
            {detail.totalTokens === undefined ? (
              <Text className="text-muted-foreground text-xs">{unavailable}</Text>
            ) : null}
          </View>
          <AiUsageDetailRow
            label={t('chat.messageUsage.requests')}
            value={
              detail.requestCount === undefined ? unavailable : numbers.format(detail.requestCount)
            }
          />
          {detail.imageCount !== undefined ? (
            <AiUsageDetailRow
              label={t('aiUsage.images')}
              value={numbers.format(detail.imageCount)}
            />
          ) : null}
          <View className="gap-4">
            {hasTokenDistribution ? (
              <View
                accessibilityElementsHidden
                className="h-1.5 flex-row gap-1 overflow-hidden rounded-full"
                importantForAccessibility="no-hide-descendants"
              >
                {detail.inputTokens ? (
                  <View
                    className="rounded-full bg-foreground"
                    style={{ flex: detail.inputTokens / tokenSum }}
                  />
                ) : null}
                {detail.outputTokens ? (
                  <View
                    className="rounded-full bg-muted-foreground"
                    style={{ flex: detail.outputTokens / tokenSum }}
                  />
                ) : null}
              </View>
            ) : null}
            <View className="flex-row flex-wrap gap-x-6 gap-y-5">
              <View className="min-w-32 flex-1 gap-3">
                <View className="gap-1">
                  <View className="flex-row items-center gap-1.5">
                    <View className="size-1.5 rounded-full bg-foreground" />
                    <Text className="text-muted-foreground text-sm">
                      {t('chat.messageUsage.input')}
                    </Text>
                  </View>
                  <Text className="font-medium text-foreground text-xl tabular-nums" selectable>
                    {formatTokens(detail.inputTokens)}
                  </Text>
                </View>
                <View className="gap-2">
                  {inputDetails.map(([key, value]) =>
                    value === undefined ? null : (
                      <AiUsageDetailRow key={key} label={t(key)} value={numbers.format(value)} />
                    ),
                  )}
                </View>
              </View>
              <View className="min-w-32 flex-1 gap-3">
                <View className="gap-1">
                  <View className="flex-row items-center gap-1.5">
                    <View className="size-1.5 rounded-full bg-muted-foreground" />
                    <Text className="text-muted-foreground text-sm">
                      {t('chat.messageUsage.output')}
                    </Text>
                  </View>
                  <Text className="font-medium text-foreground text-xl tabular-nums" selectable>
                    {formatTokens(detail.outputTokens)}
                  </Text>
                </View>
                {detail.reasoningTokens !== undefined ? (
                  <AiUsageDetailRow
                    label={t('chat.messageUsage.reasoning')}
                    value={numbers.format(detail.reasoningTokens)}
                  />
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {visiblePerformance.length > 0 ? (
          <View className="gap-4">
            <MessagePart.SectionTitle title={t('chat.messageUsage.performance')} />
            <View className="flex-row flex-wrap gap-x-6 gap-y-5">
              {visiblePerformance.map(([key, value]) => (
                <View className="min-w-32 flex-1 gap-1" key={key}>
                  <Text className="text-muted-foreground text-xs">{t(key)}</Text>
                  <Text className="font-medium text-foreground text-lg tabular-nums" selectable>
                    {value}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="gap-3">
          <MessagePart.SectionTitle title={t('chat.messageUsage.cost')} />
          {(detail.costs ?? []).map((cost) => {
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
                className="flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                key={cost.currency}
              >
                <View className="min-w-0 shrink flex-row flex-wrap items-baseline gap-2">
                  <Text className="font-medium text-foreground text-sm">{cost.currency}</Text>
                  <Text className="text-muted-foreground text-xs">{t(sourceKey)}</Text>
                </View>
                <Text className="font-medium text-foreground text-xl tabular-nums" selectable>
                  {formatAiUsageCost(cost.amount, cost.currency, locale)}
                </Text>
              </View>
            );
          })}
          {(detail.costs?.length ?? 0) === 0 ? (
            <Text className="text-muted-foreground text-sm">{unavailable}</Text>
          ) : null}
          {costDetails}
          {detail.hasUnpricedRecords && (detail.costs?.length ?? 0) > 0 ? (
            <Text className="text-muted-foreground text-xs">
              {t('chat.messageUsage.partialCost')}
            </Text>
          ) : null}
        </View>

        {children}
        {formattedCreatedAt ? (
          <View className="gap-1">
            <Text className="text-muted-foreground text-xs">
              {t('chat.messageUsage.createdAt')}
            </Text>
            <Text className="font-mono text-foreground text-xs" selectable>
              {formattedCreatedAt}
            </Text>
          </View>
        ) : null}
      </View>
    </MessagePart.Detail>
  );
}

export function AiUsageDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <Text className="text-muted-foreground text-xs">{label}</Text>
      <Text className="min-w-0 shrink text-foreground text-xs tabular-nums" selectable>
        {value}
      </Text>
    </View>
  );
}
