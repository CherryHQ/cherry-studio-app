import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronLeftIcon from '@cherrystudio/app-icons/icons/chevron-left';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import {
  ActionMenu,
  BottomSheet,
  Button,
  ContentState,
  DateRangePicker,
  type DateRangeValue,
  Tabs,
} from '@cherrystudio/ui/components';
import { usePreventRemove } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader } from '@/frontend/appShell/header';
import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';
import { useQuery } from '@/frontend/data';
import type {
  AiUsageRecordFilters,
  AiUsageRecordGroupBy,
  AiUsageRecordMetric,
} from '@/shared/data/api/schemas/aiUsageRecords';
import type { Currency } from '@/shared/data/types/model';

import {
  AiUsageBreakdown,
  AiUsageComposition,
  usageGroupLabel,
} from './components/AiUsageBreakdown';
import { AiUsageFilters, type UsageFilterScopes } from './components/AiUsageFilters';
import { AiUsagePerformance } from './components/AiUsagePerformance';
import { AiUsageRecords } from './components/AiUsageRecords';
import { AiUsageTrend } from './components/AiUsageTrend';
import {
  customUsageRange,
  usageGroupFilters,
  usageRange,
  type UsageRange,
} from './utils/aiUsageAnalytics';
import { addCalendarDays, toLocalDateKey } from './utils/aiUsageCalendar';

type UsageTab = 'overview' | 'composition' | 'performance';
const PERIOD_LABELS = {
  today: 'aiUsage.today',
  '7d': 'aiUsage.period7Days',
  '30d': 'aiUsage.period30Days',
  all: 'aiUsage.periodAll',
  custom: 'aiUsage.periodCustom',
} as const;

export function AiUsageScreen() {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState(() => usageRange('30d'));
  const [todayEnd, setTodayEnd] = useState(() => usageRange('today').to);
  const [tab, setTab] = useState<UsageTab>('overview');
  const [records, setRecords] = useState<{
    range: UsageRange;
    filters: AiUsageRecordFilters;
    costCurrency?: Currency;
    scopeLabel?: string;
  }>();
  const [metric, setMetric] = useState<AiUsageRecordMetric>('tokens');
  const [rankingMetric, setRankingMetric] = useState<AiUsageRecordMetric>('tokens');
  const [groupBy, setGroupBy] = useState<AiUsageRecordGroupBy>('model');
  const [scopes, setScopes] = useState<UsageFilterScopes>({});
  const [recordSearch, setRecordSearch] = useState('');
  const [recordSearchDraft, setRecordSearchDraft] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const filters: AiUsageRecordFilters = Object.assign(
    {},
    ...Object.values(scopes).map(usageGroupFilters),
  );
  const queryGroupBy = tab === 'composition' ? groupBy : 'model';
  const queryMetric = tab === 'composition' ? rankingMetric : metric;
  const query = useQuery('/ai-usage-records/analytics', {
    query: {
      ...filters,
      from: range.from,
      to: range.to,
      groupBy: queryGroupBy,
      metric: queryMetric === 'cost' ? 'tokens' : queryMetric,
      limit: tab === 'overview' ? 3 : 10,
      includePerformance: tab === 'performance',
    },
  });
  const data = query.data;
  const refresh = () => {
    const nextEnd = usageRange('today').to;
    setTodayEnd(nextEnd);
    if (range.period !== 'custom' && range.to === todayEnd) setRange(usageRange(range.period));
    void query.refetch();
  };
  const openRecords = (next: NonNullable<typeof records>) => {
    setRecordSearch('');
    setRecordSearchDraft('');
    setRecords(next);
  };
  const span =
    range.period === 'today' ? 1 : range.period === '7d' ? 7 : range.period === '30d' ? 30 : 0;
  const shiftRange = (direction: number) =>
    setRange({
      ...range,
      from: addCalendarDays(new Date(range.from), span * direction).getTime(),
      to: addCalendarDays(new Date(range.to + 1), span * direction).getTime() - 1,
    });
  const rangeStart = range.period === 'all' ? (data?.firstRecordAt ?? range.to) : range.from;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    ...(new Date(rangeStart).getFullYear() !== new Date(range.to).getFullYear() ||
    new Date(range.to).getFullYear() !== new Date(todayEnd).getFullYear()
      ? { year: '2-digit' as const }
      : {}),
  });
  const closeRecords = () => setRecords(undefined);
  usePreventRemove(!!records, closeRecords);

  return (
    <>
      <View
        className="flex-1"
        style={{ paddingTop: resolveHeaderContentInset(headerHeight) }}
        testID="ai-usage-content"
      >
        {!records ? (
          <View className="px-4 pb-3">
            <Tabs
              accessibilityLabel={t('aiUsage.title')}
              variant="underline"
              layout="hug"
              testID="ai-usage-views"
              value={tab}
              onValueChange={setTab}
              items={[
                {
                  value: 'overview',
                  label: t('aiUsage.overview'),
                  testID: 'ai-usage-tab-overview',
                },
                {
                  value: 'composition',
                  label: t('aiUsage.composition'),
                  testID: 'ai-usage-tab-composition',
                },
                {
                  value: 'performance',
                  label: t('aiUsage.performance'),
                  testID: 'ai-usage-tab-performance',
                },
              ]}
            />
            <View className="min-h-14 flex-row items-center justify-between gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('aiUsage.timeRange')}, ${t(PERIOD_LABELS[range.period])}, ${dateFormatter.format(rangeStart)} – ${dateFormatter.format(range.to)}`}
                className="min-h-11 min-w-0 flex-1 flex-row items-center gap-2"
                onPress={() => setDateOpen(true)}
                testID="ai-usage-periods"
              >
                <Text className="font-medium text-foreground text-xs">
                  {t(PERIOD_LABELS[range.period])}
                </Text>
                <Text className="shrink text-muted-foreground text-xs">
                  {dateFormatter.format(rangeStart)} – {dateFormatter.format(range.to)}
                </Text>
                <ChevronDownIcon className="size-3.5 text-muted-foreground" />
              </Pressable>
              {span > 0 ? (
                <View className="min-h-11 flex-row items-center gap-1">
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={<ChevronLeftIcon />}
                    accessibilityLabel={t('aiUsage.previousPeriod')}
                    disabled={addCalendarDays(new Date(range.from), -span).getTime() < 0}
                    onPress={() => shiftRange(-1)}
                  />
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={<ChevronRightIcon />}
                    accessibilityLabel={t('aiUsage.nextPeriod')}
                    disabled={range.to >= todayEnd}
                    onPress={() => shiftRange(1)}
                  />
                </View>
              ) : null}
            </View>
            <AiUsageFilters range={range} scopes={scopes} onChange={setScopes} />
          </View>
        ) : null}
        {records ? (
          <AiUsageRecords
            range={records.range}
            filters={{ ...records.filters, search: recordSearch || undefined }}
            costCurrency={records.costCurrency}
            scopeLabel={records.scopeLabel}
            locale={locale}
            searchDraft={recordSearchDraft}
            onSearchDraftChange={setRecordSearchDraft}
            onSearch={(value) => {
              setRecordSearch(value.trim());
              setRecordSearchDraft(value);
            }}
          />
        ) : (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: insets.bottom + 24,
              gap: 24,
            }}
            refreshControl={<RefreshControl refreshing={query.isRefreshing} onRefresh={refresh} />}
          >
            {query.isError ? (
              <ContentState.Error
                title={t('aiUsage.loadError')}
                primaryAction={{ children: t('aiUsage.retry'), onPress: refresh }}
              />
            ) : null}
            {query.isLoading ? (
              <ContentState.Loading title={t('aiUsage.loading')} />
            ) : !data ? null : (
              <>
                {tab === 'performance' ? (
                  data.performance ? (
                    <AiUsagePerformance
                      performance={data.performance}
                      models={data.performanceByModel ?? []}
                      locale={locale}
                      onSelect={(model) =>
                        openRecords({
                          range,
                          filters: {
                            ...filters,
                            providerId: model.providerId,
                            modelId: model.modelId,
                          },
                          scopeLabel: model.modelId ?? t('aiUsage.unknownModel'),
                        })
                      }
                    />
                  ) : null
                ) : (
                  <>
                    {tab === 'overview' ? (
                      <AiUsageTrend
                        key={JSON.stringify([range, filters, metric])}
                        data={data}
                        range={range}
                        onMetricChange={setMetric}
                        metric={metric}
                        locale={locale}
                        onOpenRecords={(point) =>
                          openRecords({
                            range: point
                              ? { from: point.from, to: point.to, period: 'custom' }
                              : range,
                            filters,
                          })
                        }
                      />
                    ) : (
                      <>
                        <AiUsageComposition data={data} locale={locale} />
                        <AiUsageBreakdown
                          data={data}
                          groupBy={groupBy}
                          metric={rankingMetric}
                          range={range}
                          filters={filters}
                          locale={locale}
                          onGroupChange={setGroupBy}
                          onMetricChange={setRankingMetric}
                          onSelect={(bucket) =>
                            openRecords({
                              range,
                              filters: { ...filters, ...usageGroupFilters(bucket) },
                              costCurrency:
                                rankingMetric === 'cost'
                                  ? (bucket.costCurrency ?? undefined)
                                  : undefined,
                              scopeLabel: usageGroupLabel(bucket, t),
                            })
                          }
                        />
                        {data.composition.imageCount !== null ? (
                          <View className="flex-row justify-between gap-3 border-t border-border-subtle px-1 pt-4">
                            <Text className="text-muted-foreground text-xs">
                              {t('aiUsage.images')}
                            </Text>
                            <Text className="font-medium text-foreground text-sm">
                              {data.composition.imageCount.toLocaleString(locale)}
                            </Text>
                          </View>
                        ) : null}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>
      <RouteHeader
        title={t(records ? 'aiUsage.callDetails' : 'aiUsage.title')}
        onBack={records ? closeRecords : undefined}
      />
      {dateOpen ? (
        <AiUsageDateRange
          range={range}
          onClose={() => setDateOpen(false)}
          onApply={(next) => {
            setRange(next);
            setDateOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function AiUsageDateRange({
  range,
  onApply,
  onClose,
}: {
  range: UsageRange;
  onApply: (range: UsageRange) => void;
  onClose: () => void;
}) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [draft, setDraft] = useState<DateRangeValue>(() => ({
    startDate: new Date(range.from === 0 ? range.to : range.from),
    endDate: new Date(range.to),
  }));
  const nextRange =
    draft.startDate && draft.endDate
      ? customUsageRange(toLocalDateKey(draft.startDate), toLocalDateKey(draft.endDate))
      : null;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return (
    <BottomSheet
      open
      onClose={onClose}
      size="large"
      title={t('aiUsage.timeRange')}
      headerAction={
        <ActionMenu
          items={(['today', '7d', '30d', 'all'] as const).map((period) => ({
            id: period,
            label: t(PERIOD_LABELS[period]),
            onPress: () => onApply(usageRange(period)),
          }))}
        >
          <Button size="sm" variant="ghost">
            <Button.Label>{t('aiUsage.quickRanges')}</Button.Label>
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
          </Button>
        </ActionMenu>
      }
      footer={
        <Button
          disabled={!nextRange}
          onPress={() => {
            if (nextRange) onApply(nextRange);
          }}
        >
          {t('common.done')}
        </Button>
      }
    >
      <ScrollView contentContainerClassName="gap-4 px-4 pb-4">
        <Text accessibilityLiveRegion="polite" className="font-medium text-base text-foreground">
          {draft.startDate ? dateFormatter.format(draft.startDate) : t('aiUsage.fromDate')}
          {' – '}
          {draft.endDate ? dateFormatter.format(draft.endDate) : t('aiUsage.toDate')}
        </Text>
        <DateRangePicker
          locale={locale}
          minimumDate={new Date(0)}
          value={draft}
          onValueChange={setDraft}
          testID="ai-usage-date-range"
        />
      </ScrollView>
    </BottomSheet>
  );
}
