import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Button, ContentState, Section } from '@cherrystudio/ui/components';
import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { BrandAvatar, BrandAvatarIcon } from '@/frontend/components/avatar';
import type {
  AiUsageRecordCostTotal,
  AiUsageRecordTimelineBucket,
} from '@/shared/data/api/schemas/aiUsageRecords';

import { useAiUsageOverview } from '../hooks/useAiUsageOverview';
import { getFirstAiUsageDateKey } from '../utils/aiUsageOverview';
import { AiUsageCalendar } from './AiUsageCalendar';
import { AiUsageSectionStatus } from './AiUsageSectionState';

const costSymbols = {
  CNY: '\u00a5',
  USD: '$',
} satisfies Record<AiUsageRecordCostTotal['currency'], string>;

export function AiUsageSummaryCard() {
  const { i18n, t } = useTranslation();
  const { calendarData, data, hasData, isError, isLoading, isRefreshing, refetch, topProviders } =
    useAiUsageOverview();
  const isInitialLoading = isLoading && !hasData;
  const showInitialError = isError && !hasData;
  const animationStartDateKey = getFirstAiUsageDateKey(calendarData);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const formattedTokens = formatTotalTokens(data?.buckets, locale);
  const formattedCost = formatCostTotals(data?.costTotals ?? [], locale);

  return (
    <View className="w-full rounded-2xl bg-grouped-surface p-4" style={styles.continuousCorners}>
      <Section.Header
        className="px-0"
        title={
          <View className="min-w-0 flex-row items-center gap-2">
            <Text
              adjustsFontSizeToFit
              className="min-w-0 shrink font-semibold text-foreground text-lg"
              maxFontSizeMultiplier={1.2}
              minimumFontScale={0.85}
              numberOfLines={1}
            >
              {t('aiUsage.title')}
            </Text>
            <AiUsageSectionStatus
              isError={isError && hasData}
              isRefreshing={isRefreshing}
              loadingTestID="ai-usage-summary-refreshing"
              retryTestID="ai-usage-summary-refresh-retry"
              onRetry={() => void refetch()}
            />
          </View>
        }
      >
        <Link href="/home/ai-usage" asChild>
          <Button
            accessibilityRole="link"
            className="gap-0.5 px-0 py-1"
            size="xs"
            testID="ai-usage-view-details"
            variant="ghost"
          >
            <Button.Label numberOfLines={1}>{t('aiUsage.viewDetails')}</Button.Label>
            <ChevronRightIcon className="size-4 text-foreground" />
          </Button>
        </Link>
      </Section.Header>

      {showInitialError ? (
        <ContentState.Error
          primaryAction={{
            children: t('aiUsage.retry'),
            icon: <RefreshCwIcon />,
            onPress: () => void refetch(),
            testID: 'ai-usage-summary-retry',
          }}
          style={styles.stateContent}
          title={t('aiUsage.loadError')}
        />
      ) : (
        <View className="mt-4">
          <AiUsageCalendar
            animationStartDateKey={animationStartDateKey}
            data={calendarData}
            isLoading={isInitialLoading}
            layout="fit"
          />
          <View className="mt-4 flex-row gap-6" testID="ai-usage-summary-metrics">
            <View className="min-w-0 flex-1 gap-0.5" testID="ai-usage-summary-tokens">
              <Text
                selectable
                adjustsFontSizeToFit
                className="min-w-0 font-semibold text-foreground text-lg"
                maxFontSizeMultiplier={1.2}
                minimumFontScale={0.65}
                numberOfLines={1}
                style={styles.metricValue}
              >
                {formattedTokens}
              </Text>
              <Text className="text-muted-foreground text-sm" maxFontSizeMultiplier={1.2}>
                {t('aiUsage.tokens')}
              </Text>
            </View>
            <View className="min-w-0 flex-1 gap-0.5" testID="ai-usage-summary-cost">
              <Text
                selectable
                adjustsFontSizeToFit
                className="min-w-0 font-semibold text-foreground text-lg"
                maxFontSizeMultiplier={1.2}
                minimumFontScale={0.65}
                numberOfLines={1}
                style={styles.metricValue}
              >
                {formattedCost}
              </Text>
              <Text className="text-muted-foreground text-sm" maxFontSizeMultiplier={1.2}>
                {t('aiUsage.cost')}
              </Text>
            </View>
          </View>
          <View
            className="mt-4 min-h-6 flex-row items-center gap-2"
            testID="ai-usage-summary-providers"
          >
            {topProviders.map((provider) => (
              <AiUsageProviderPill
                key={provider.providerId ?? provider.providerName ?? 'unknown'}
                providerId={provider.providerId}
                providerName={provider.providerName}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  continuousCorners: {
    borderCurve: 'continuous',
  },
  metricValue: {
    fontVariant: ['tabular-nums'],
  },
  stateContent: {
    minHeight: 104,
  },
});

function AiUsageProviderPill({
  providerId,
  providerName,
}: {
  providerId: string | null;
  providerName: string | null;
}) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const label = providerName || providerId || t('aiUsage.unknownProvider');
  const iconSource = resolveProviderIcon(providerId ?? '');

  return (
    <View
      className="min-w-0 flex-1 flex-row items-center gap-2"
      testID={`ai-usage-summary-provider-${providerId ?? 'unknown'}`}
    >
      {iconSource ? (
        <BrandAvatar label={label} size={24}>
          <BrandAvatarIcon
            iconId={providerId ?? undefined}
            recyclingKey={providerId ?? undefined}
            source={iconSource[theme === 'dark' ? 'dark' : 'light']}
          />
        </BrandAvatar>
      ) : (
        <BrandAvatar label={label} size={24} />
      )}
      <Text className="min-w-0 shrink text-foreground text-sm" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function formatTotalTokens(
  buckets: readonly AiUsageRecordTimelineBucket[] | undefined,
  locale: string,
): string {
  if (!buckets) return '--';

  const totalTokens = buckets.reduce((total, bucket) => total + bucket.totalTokens, 0);
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(totalTokens);
}

function formatCostTotals(costTotals: readonly AiUsageRecordCostTotal[], locale: string): string {
  if (costTotals.length === 0) return '--';

  const numberFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

  return costTotals
    .map(({ currency, total }) => `${costSymbols[currency]}${numberFormatter.format(total)}`)
    .join(' · ');
}
