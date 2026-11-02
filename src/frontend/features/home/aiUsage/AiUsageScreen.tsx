import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import SlidersHorizontalIcon from '@cherrystudio/app-icons/icons/sliders-horizontal';
import {
  ActionMenu,
  BottomSheet,
  Button,
  Chip,
  ContentState,
  Input,
  SearchField,
  Section,
  Tabs,
  TextField,
} from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
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
import type { Currency } from '@/shared/data/types/model';

import {
  AiUsageBreakdown,
  AiUsageComposition,
  GROUP_LABELS,
  usageGroupLabel,
} from './components/AiUsageBreakdown';
import { AiUsagePerformance } from './components/AiUsagePerformance';
import { AiUsageRecords, MODALITY_LABELS } from './components/AiUsageRecords';
import { AiUsageTrend } from './components/AiUsageTrend';
import {
  customUsageRange,
  formatUsageDate,
  usageGroupFilters,
  usageGroupKey,
  usageRange,
  type UsagePeriod,
  type UsageRange,
} from './utils/aiUsageAnalytics';
import { toLocalDateKey } from './utils/aiUsageCalendar';

type UsageTab = 'overview' | 'composition' | 'performance' | 'records';
const PERIOD_LABELS = {
  today: 'aiUsage.today',
  '7d': 'aiUsage.last7Days',
  '30d': 'aiUsage.last30Days',
  all: 'aiUsage.allTime',
  custom: 'aiUsage.custom',
} as const;

export function AiUsageScreen() {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState(() => usageRange('7d'));
  const [tab, setTab] = useState<UsageTab>('overview');
  const [metric, setMetric] = useState<AiUsageRecordMetric>('tokens');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [groupBy, setGroupBy] = useState<AiUsageRecordGroupBy>('model');
  const [scopes, setScopes] = useState<
    Partial<Record<AiUsageRecordGroupBy, AiUsageRecordStatsBucket>>
  >({});
  const [modality, setModality] = useState<AiUsageRecordModality>();
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const filters: AiUsageRecordFilters = Object.assign(
    {},
    ...Object.values(scopes).map(usageGroupFilters),
    { modality, search: search || undefined },
  );
  const query = useQuery('/ai-usage-records/analytics', {
    query: {
      ...filters,
      from: range.from,
      to: range.to,
      groupBy,
      metric,
      currency,
      limit: filterOpen ? 50 : 10,
      includePerformance: tab === 'performance',
    },
  });
  const data = query.data;
  const selectScope = (bucket: AiUsageRecordStatsBucket) =>
    setScopes((current) => ({ ...current, [bucket.groupBy]: bucket }));
  const refresh = () => {
    if (range.period !== 'custom') setRange(usageRange(range.period));
    void query.refetch();
  };
  const metricItems = [
    { value: 'tokens' as const, label: t('aiUsage.tokens') },
    { value: 'cost' as const, label: t('aiUsage.cost') },
    { value: 'requests' as const, label: t('chat.messageUsage.requests') },
  ];
  const activeScopes = Object.entries(scopes) as [AiUsageRecordGroupBy, AiUsageRecordStatsBucket][];
  const hasFilters = activeScopes.length > 0 || modality !== undefined || search !== '';

  return (
    <>
      <View
        className="flex-1"
        style={{ paddingTop: resolveHeaderContentInset(headerHeight) }}
        testID="ai-usage-content"
      >
        <View className="gap-3 px-5 pb-4">
          <View className="flex-row items-center justify-between gap-3">
            <ActionMenu
              items={(Object.keys(PERIOD_LABELS) as UsagePeriod[]).map((period) => ({
                id: period,
                label: t(PERIOD_LABELS[period]),
                checked: range.period === period,
                onPress: () =>
                  period === 'custom' ? setDateOpen(true) : setRange(usageRange(period)),
              }))}
            >
              <Button size="sm" variant="secondary" shape="pill">
                {t(PERIOD_LABELS[range.period])}
              </Button>
            </ActionMenu>
            <View className="flex-row items-center gap-1">
              {tab !== 'performance' && (metric === 'cost' || tab === 'records') ? (
                <ActionMenu
                  items={(['USD', 'CNY'] as const).map((value) => ({
                    id: value,
                    label: value,
                    checked: value === currency,
                    onPress: () => setCurrency(value),
                  }))}
                >
                  <Button size="sm" variant="ghost" accessibilityLabel={t('aiUsage.currency')}>
                    {currency}
                  </Button>
                </ActionMenu>
              ) : null}
              <Button
                accessibilityLabel={t('common.filter')}
                icon={<SlidersHorizontalIcon />}
                size="sm"
                variant="ghost"
                onPress={() => setFilterOpen(true)}
              />
              {tab !== 'records' ? (
                <Button
                  accessibilityLabel={t('aiUsage.refresh')}
                  icon={<RefreshCwIcon />}
                  loading={query.isRefreshing}
                  size="sm"
                  variant="ghost"
                  onPress={refresh}
                />
              ) : null}
            </View>
          </View>
          {range.period === 'custom' ? (
            <Text className="text-muted-foreground text-xs">
              {formatUsageDate(range.from, locale)} – {formatUsageDate(range.to, locale)}
            </Text>
          ) : null}
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
                    setSearchDraft('');
                  }}
                >
                  {search}
                </Chip.Removable>
              ) : null}
            </ScrollView>
          ) : null}
          <Tabs
            accessibilityLabel={t('aiUsage.title')}
            value={tab}
            onValueChange={setTab}
            items={[
              { value: 'overview', label: t('aiUsage.overview') },
              { value: 'composition', label: t('aiUsage.composition') },
              { value: 'performance', label: t('aiUsage.performance') },
              { value: 'records', label: t('aiUsage.records') },
            ]}
          />
        </View>
        {tab === 'records' ? (
          <AiUsageRecords range={range} filters={filters} currency={currency} locale={locale} />
        ) : (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 20,
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
            ) : !data ? null : data.stats.totals.recordCount === 0 ? (
              <ContentState.Empty title={t('aiUsage.noRecords')} />
            ) : (
              <>
                {tab === 'performance' ? (
                  data.performance ? (
                    <AiUsagePerformance performance={data.performance} locale={locale} />
                  ) : null
                ) : (
                  <>
                    <Tabs
                      accessibilityLabel={t('aiUsage.metric')}
                      value={metric}
                      onValueChange={setMetric}
                      items={metricItems}
                    />
                    {tab === 'overview' ? (
                      <AiUsageTrend
                        key={JSON.stringify([range, filters, metric, currency])}
                        data={data}
                        range={range}
                        metric={metric}
                        currency={currency}
                        locale={locale}
                        onOpenRecords={(point) => {
                          setRange({ from: point.from, to: point.to, period: 'custom' });
                          setTab('records');
                        }}
                      />
                    ) : (
                      <>
                        <AiUsageBreakdown
                          data={data}
                          groupBy={groupBy}
                          metric={metric}
                          currency={currency}
                          locale={locale}
                          onGroupChange={setGroupBy}
                          onSelect={(bucket) => {
                            selectScope(bucket);
                            setTab('records');
                          }}
                        />
                        <AiUsageComposition data={data} locale={locale} />
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>
      <RouteHeader title={t('aiUsage.title')} />
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
      <BottomSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        size="large"
        title={t('common.filter')}
        avoidKeyboard
        closeAction={{ accessibilityLabel: t('common.close') }}
      >
        <View className="gap-3 px-5 pb-3">
          <SearchField
            accessibilityLabel={t('aiUsage.search')}
            clearAccessibilityLabel={t('common.clear')}
            placeholder={t('aiUsage.search')}
            value={searchDraft}
            onChangeText={(value) => setSearchDraft(value.slice(0, 200))}
            onSubmitEditing={() => setSearch(searchDraft.trim())}
            onClear={() => {
              setSearchDraft('');
              setSearch('');
            }}
          />
          <View className="flex-row justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              onPress={() => {
                setScopes({});
                setModality(undefined);
                setSearch('');
                setSearchDraft('');
              }}
            >
              {t('common.clear')}
            </Button>
            <Button size="sm" variant="secondary" onPress={() => setSearch(searchDraft.trim())}>
              {t('aiUsage.searchAction')}
            </Button>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            <Chip.Selectable selected={!modality} onSelectedChange={() => setModality(undefined)}>
              {t('aiUsage.allTypes')}
            </Chip.Selectable>
            {(Object.keys(MODALITY_LABELS) as AiUsageRecordModality[]).map((value) => (
              <Chip.Selectable
                key={value}
                selected={modality === value}
                onSelectedChange={(selected) => setModality(selected ? value : undefined)}
              >
                {t(MODALITY_LABELS[value])}
              </Chip.Selectable>
            ))}
          </ScrollView>
          <Tabs
            accessibilityLabel={t('aiUsage.distribution')}
            value={groupBy}
            onValueChange={setGroupBy}
            items={(Object.keys(GROUP_LABELS) as AiUsageRecordGroupBy[]).map((value) => ({
              value,
              label: t(GROUP_LABELS[value]),
            }))}
          />
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {query.isLoading ? (
            <ContentState.Loading title={t('aiUsage.loading')} />
          ) : query.isError ? (
            <ContentState.Error
              title={t('aiUsage.loadError')}
              primaryAction={{ children: t('aiUsage.retry'), onPress: refresh }}
            />
          ) : (
            <Section variant="plain">
              {data?.stats.buckets.map((bucket) => (
                <Section.RadioItem
                  key={usageGroupKey(bucket)}
                  label={usageGroupLabel(bucket, t)}
                  selected={
                    scopes[groupBy]
                      ? usageGroupKey(scopes[groupBy]!) === usageGroupKey(bucket)
                      : false
                  }
                  onPress={() => {
                    selectScope(bucket);
                    setFilterOpen(false);
                  }}
                />
              ))}
            </Section>
          )}
          {data?.stats.other.recordCount ? (
            <Text className="py-3 text-muted-foreground text-xs">{t('aiUsage.refineSearch')}</Text>
          ) : null}
          {data?.stats.totals.recordCount === 0 ? (
            <ContentState.Empty title={t('aiUsage.noRecords')} />
          ) : null}
        </ScrollView>
      </BottomSheet>
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
      title={t('aiUsage.custom')}
      closeAction={{ accessibilityLabel: t('common.close') }}
      footer={
        <Button
          onPress={() => {
            setSubmitted(true);
            if (nextRange) onApply(nextRange);
          }}
        >
          {t('common.done')}
        </Button>
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}
      >
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
          <TextField.Description>{t('aiUsage.dateFormat')}</TextField.Description>
          {submitted && !nextRange ? (
            <TextField.Error>{t('aiUsage.invalidDates')}</TextField.Error>
          ) : null}
        </TextField>
      </ScrollView>
    </BottomSheet>
  );
}
