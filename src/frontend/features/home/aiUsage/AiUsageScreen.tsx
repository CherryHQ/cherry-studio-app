import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronLeftIcon from '@cherrystudio/app-icons/icons/chevron-left';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import SlidersHorizontalIcon from '@cherrystudio/app-icons/icons/sliders-horizontal';
import {
  BottomSheet,
  Button,
  Chip,
  ContentState,
  Input,
  Tabs,
  TextField,
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
  AiUsageRecordStatsBucket,
} from '@/shared/data/api/schemas/aiUsageRecords';
import type { AiUsageRecordModality } from '@/shared/data/types/aiUsageRecord';

import {
  AiUsageBreakdown,
  AiUsageComposition,
  usageGroupLabel,
} from './components/AiUsageBreakdown';
import { AiUsageFilters } from './components/AiUsageFilters';
import { AiUsagePerformance } from './components/AiUsagePerformance';
import { AiUsageRecords, MODALITY_LABELS } from './components/AiUsageRecords';
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
    scopeLabel?: string;
  }>();
  const [metric, setMetric] = useState<AiUsageRecordMetric>('tokens');
  const [rankingMetric, setRankingMetric] = useState<AiUsageRecordMetric>('tokens');
  const [groupBy, setGroupBy] = useState<AiUsageRecordGroupBy>('model');
  const [scopes, setScopes] = useState<
    Partial<Record<AiUsageRecordGroupBy, AiUsageRecordStatsBucket>>
  >({});
  const [modality, setModality] = useState<AiUsageRecordModality>();
  const [search, setSearch] = useState('');
  const [recordSearch, setRecordSearch] = useState('');
  const [recordSearchDraft, setRecordSearchDraft] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const filters: AiUsageRecordFilters = Object.assign(
    {},
    ...Object.values(scopes).map(usageGroupFilters),
    { modality, search: search || undefined },
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
  const activeScopes = Object.entries(scopes) as [AiUsageRecordGroupBy, AiUsageRecordStatsBucket][];
  const hasFilters = activeScopes.length > 0 || modality !== undefined || search !== '';
  const openRecords = (next: NonNullable<typeof records>) => {
    setRecordSearch(search);
    setRecordSearchDraft(search);
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
          <View className={hasFilters ? 'px-4 pb-4' : 'px-4'}>
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
            <View className="min-h-16 flex-row items-center justify-between gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('aiUsage.timeRange')}, ${t(PERIOD_LABELS[range.period])}, ${dateFormatter.format(rangeStart)} – ${dateFormatter.format(range.to)}`}
                className="min-h-11 min-w-0 flex-1 flex-row flex-wrap items-center gap-2"
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
                <View className="flex-row">
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
            {hasFilters ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {activeScopes.map(([group, bucket]) => (
                  <Chip.Removable
                    key={group}
                    removeAccessibilityLabel={t('aiUsage.removeFilter', {
                      name: usageGroupLabel(bucket, t),
                    })}
                    onRemove={() =>
                      setScopes((current) => {
                        const next = { ...current };
                        delete next[group];
                        return next;
                      })
                    }
                  >
                    {usageGroupLabel(bucket, t)}
                  </Chip.Removable>
                ))}
                {modality ? (
                  <Chip.Removable
                    removeAccessibilityLabel={t('aiUsage.removeFilter', {
                      name: t(MODALITY_LABELS[modality]),
                    })}
                    onRemove={() => setModality(undefined)}
                  >
                    {t(MODALITY_LABELS[modality])}
                  </Chip.Removable>
                ) : null}
                {search ? (
                  <Chip.Removable
                    removeAccessibilityLabel={t('common.clear')}
                    onRemove={() => {
                      setSearch('');
                    }}
                  >
                    {search}
                  </Chip.Removable>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        ) : null}
        {records ? (
          <AiUsageRecords
            range={records.range}
            filters={{ ...records.filters, search: recordSearch || undefined }}
            scopeLabel={records.scopeLabel}
            currencies={data?.timeline.costTotals.map((item) => item.currency) ?? []}
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
        rightActions={
          records
            ? []
            : [
                {
                  type: 'icon',
                  key: 'filter',
                  icon: SlidersHorizontalIcon,
                  accessibilityLabel: t('common.filter'),
                  testID: 'ai-usage-filter',
                  onPress: () => setFilterOpen(true),
                },
              ]
        }
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
      {filterOpen ? (
        <AiUsageFilters
          range={range}
          scopes={scopes}
          modality={modality}
          search={search}
          onClose={() => setFilterOpen(false)}
          onApply={(next) => {
            setScopes(next.scopes);
            setModality(next.modality);
            setSearch(next.search);
            setFilterOpen(false);
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
  const { t } = useTranslation();
  const [from, setFrom] = useState(() =>
    toLocalDateKey(new Date(range.from === 0 ? range.to : range.from)),
  );
  const [to, setTo] = useState(() => toLocalDateKey(new Date(range.to)));
  const [submitted, setSubmitted] = useState(false);
  const nextRange = customUsageRange(from, to);
  return (
    <BottomSheet
      open
      onClose={onClose}
      size="medium"
      avoidKeyboard
      title={t('aiUsage.timeRange')}
      closeAction={{ accessibilityLabel: t('common.close') }}
      footer={
        <Button
          onPress={() => {
            setSubmitted(true);
            if (nextRange) onApply(nextRange);
          }}
        >
          {t('aiUsage.applyCustomRange')}
        </Button>
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}
      >
        <View className="flex-row flex-wrap gap-3">
          {(['today', '7d', '30d', 'all'] as const).map((period) => (
            <View className="min-w-0 flex-1 basis-[45%]" key={period}>
              <Chip.Selectable
                accessibilityRole="radio"
                className="min-h-11 w-full justify-center rounded-lg"
                selected={range.period === period}
                onSelectedChange={() => onApply(usageRange(period))}
                testID={`ai-usage-period-${period}`}
              >
                {t(PERIOD_LABELS[period])}
              </Chip.Selectable>
            </View>
          ))}
        </View>
        <View className="flex-row flex-wrap gap-3">
          <View className="min-w-36 flex-1">
            <TextField invalid={submitted && !nextRange}>
              <TextField.Label>{t('aiUsage.fromDate')}</TextField.Label>
              <Input
                accessibilityLabel={t('aiUsage.fromDate')}
                value={from}
                onChangeText={setFrom}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
              />
            </TextField>
          </View>
          <View className="min-w-36 flex-1">
            <TextField invalid={submitted && !nextRange}>
              <TextField.Label>{t('aiUsage.toDate')}</TextField.Label>
              <Input
                accessibilityLabel={t('aiUsage.toDate')}
                value={to}
                onChangeText={setTo}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
              />
              {submitted && !nextRange ? (
                <TextField.Error>{t('aiUsage.invalidDates')}</TextField.Error>
              ) : null}
            </TextField>
          </View>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
