import {
  BottomSheet,
  Button,
  ContentState,
  SearchField,
  Section,
} from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useQuery } from '@/frontend/data';
import type {
  AiUsageRecordGroupBy,
  AiUsageRecordStatsBucket,
} from '@/shared/data/api/schemas/aiUsageRecords';
import type { AiUsageRecordModality } from '@/shared/data/types/aiUsageRecord';

import { usageGroupFilters, usageGroupKey, type UsageRange } from '../utils/aiUsageAnalytics';
import { GROUP_LABELS, usageGroupLabel } from './AiUsageBreakdown';
import { MODALITY_LABELS } from './AiUsageRecords';

type UsageFilterSelection = {
  scopes: Partial<Record<AiUsageRecordGroupBy, AiUsageRecordStatsBucket>>;
  modality?: AiUsageRecordModality;
  search: string;
};

export function AiUsageFilters({
  range,
  scopes,
  modality,
  search,
  onApply,
  onClose,
}: UsageFilterSelection & {
  range: UsageRange;
  onApply: (selection: UsageFilterSelection) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({ scopes, modality, search });
  const [field, setField] = useState<AiUsageRecordGroupBy | 'modality'>();
  const apply = () => onApply({ ...draft, search: draft.search.trim() });
  const selectScope = (group: AiUsageRecordGroupBy, bucket?: AiUsageRecordStatsBucket) => {
    setDraft((current) => {
      const next = { ...current.scopes };
      delete next[group];
      if (bucket) {
        if ('providerId' in bucket) {
          for (const providerGroup of ['provider', 'model', 'apiKey'] as const) {
            const scope = next[providerGroup];
            if (scope && 'providerId' in scope && scope.providerId !== bucket.providerId)
              delete next[providerGroup];
          }
        }
        next[group] = bucket;
      }
      return { ...current, scopes: next };
    });
    setField(undefined);
  };
  const selectModality = (value?: AiUsageRecordModality) => {
    setDraft((current) => ({ ...current, modality: value }));
    setField(undefined);
  };
  return (
    <BottomSheet
      open
      onClose={onClose}
      size={field === 'modality' ? 'compact' : 'medium'}
      title={t(
        field === 'modality' ? 'aiUsage.modality' : field ? GROUP_LABELS[field] : 'common.filter',
      )}
      avoidKeyboard
      closeAction={{ accessibilityLabel: t('common.close') }}
      backAction={
        field
          ? { accessibilityLabel: t('common.back'), onPress: () => setField(undefined) }
          : undefined
      }
      footer={
        !field ? (
          <View className="flex-row gap-3">
            <Button
              variant="tonal"
              onPress={() => setDraft({ scopes: {}, modality: undefined, search: '' })}
            >
              {t('aiUsage.resetFilters')}
            </Button>
            <View className="flex-1">
              <Button onPress={apply}>{t('aiUsage.applyFilters')}</Button>
            </View>
          </View>
        ) : undefined
      }
    >
      {field === 'modality' ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          <Section variant="plain">
            <Section.RadioItem
              label={t('aiUsage.all')}
              selected={!draft.modality}
              onPress={() => selectModality()}
            />
            {(Object.keys(MODALITY_LABELS) as AiUsageRecordModality[]).map((value) => (
              <Section.RadioItem
                key={value}
                label={t(MODALITY_LABELS[value])}
                selected={draft.modality === value}
                onPress={() => selectModality(value)}
              />
            ))}
          </Section>
        </ScrollView>
      ) : field ? (
        <AiUsageFilterOptions
          key={field}
          range={range}
          selection={draft}
          groupBy={field}
          onSelect={(bucket) => selectScope(field, bucket)}
        />
      ) : (
        <View className="flex-1 gap-4">
          <View className="px-5">
            <SearchField
              accessibilityLabel={t('aiUsage.search')}
              clearAccessibilityLabel={t('common.clear')}
              placeholder={t('aiUsage.search')}
              value={draft.search}
              onChangeText={(value) =>
                setDraft((current) => ({ ...current, search: value.slice(0, 200) }))
              }
              onSubmitEditing={apply}
              onClear={() => setDraft((current) => ({ ...current, search: '' }))}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          >
            <Section contentClassName="rounded-none bg-transparent">
              {(Object.keys(GROUP_LABELS) as AiUsageRecordGroupBy[]).map((group) => {
                const selected = draft.scopes[group];
                return (
                  <Section.SelectItem
                    key={group}
                    label={t(GROUP_LABELS[group])}
                    value={
                      selected ? (
                        usageGroupLabel(selected, t)
                      ) : (
                        <Text className="text-base text-muted-foreground">{t('aiUsage.all')}</Text>
                      )
                    }
                    onPress={() => setField(group)}
                  />
                );
              })}
              <Section.SelectItem
                label={t('aiUsage.modality')}
                value={
                  draft.modality ? (
                    t(MODALITY_LABELS[draft.modality])
                  ) : (
                    <Text className="text-base text-muted-foreground">{t('aiUsage.all')}</Text>
                  )
                }
                onPress={() => setField('modality')}
              />
            </Section>
          </ScrollView>
        </View>
      )}
    </BottomSheet>
  );
}

function AiUsageFilterOptions({
  range,
  selection,
  groupBy,
  onSelect,
}: {
  range: UsageRange;
  selection: UsageFilterSelection;
  groupBy: AiUsageRecordGroupBy;
  onSelect: (bucket?: AiUsageRecordStatsBucket) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  // Options exclude their own facet. Provider changes can replace a model/key
  // from another provider; the parent removes those incompatible selections.
  const optionScopes = Object.entries(selection.scopes).filter(
    ([group]) => group !== groupBy && (groupBy !== 'provider' || group === 'source'),
  );
  const query = useQuery('/ai-usage-records/analytics', {
    query: {
      ...Object.assign({}, ...optionScopes.map(([, bucket]) => usageGroupFilters(bucket))),
      from: range.from,
      to: range.to,
      modality: selection.modality,
      search: search.trim() || undefined,
      groupBy,
      metric: 'requests',
      limit: 50,
    },
  });
  const selected = selection.scopes[groupBy];
  const options = query.data?.stats.buckets ?? [];
  const buckets = selected
    ? [selected, ...options.filter((bucket) => usageGroupKey(bucket) !== usageGroupKey(selected))]
    : options;
  const searchLabel = t('aiUsage.searchFilter', { name: t(GROUP_LABELS[groupBy]) });
  return (
    <View className="flex-1 gap-3">
      <View className="px-5">
        <SearchField
          accessibilityLabel={searchLabel}
          clearAccessibilityLabel={t('common.clear')}
          placeholder={searchLabel}
          value={search}
          onChangeText={(value) => setSearch(value.slice(0, 200))}
          onClear={() => setSearch('')}
        />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
      >
        <Section variant="plain">
          <Section.RadioItem
            label={t('aiUsage.all')}
            selected={!selected}
            onPress={() => onSelect()}
          />
          {buckets.map((bucket) => (
            <Section.RadioItem
              key={usageGroupKey(bucket)}
              label={usageGroupLabel(bucket, t)}
              description={
                bucket.groupBy === 'model' || bucket.groupBy === 'apiKey'
                  ? bucket.providerName || bucket.providerId
                  : undefined
              }
              selected={!!selected && usageGroupKey(selected) === usageGroupKey(bucket)}
              onPress={() => onSelect(bucket)}
            />
          ))}
        </Section>
        {query.isLoading ? (
          <ContentState.Loading title={t('aiUsage.loading')} />
        ) : query.isError ? (
          <ContentState.Error
            title={t('aiUsage.loadError')}
            primaryAction={{ children: t('aiUsage.retry'), onPress: () => void query.refetch() }}
          />
        ) : query.data?.stats.buckets.length === 0 ? (
          <Text className="py-4 text-center text-muted-foreground text-sm">
            {t('aiUsage.noMatches')}
          </Text>
        ) : null}
        {query.data?.stats.other.recordCount ? (
          <Text className="py-3 text-muted-foreground text-xs">{t('aiUsage.refineSearch')}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
