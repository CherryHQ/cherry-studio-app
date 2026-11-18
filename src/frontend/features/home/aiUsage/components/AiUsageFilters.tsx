import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { ContentState, SelectField } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ModelAvatar, ProviderAvatar } from '@/frontend/components/Avatar';
import { ModelPickerDrawer } from '@/frontend/components/ModelPicker';
import { ProviderPickerDrawer } from '@/frontend/components/ProviderPicker';
import { useQuery } from '@/frontend/data';
import type { AiUsageRecordStatsGroupIdentity } from '@/shared/data/api/schemas/aiUsageRecords';

import { usageGroupKey, type UsageRange } from '../utils/aiUsageAnalytics';
import { GROUP_LABELS, usageGroupLabel } from './AiUsageBreakdown';

const FILTER_GROUPS = ['provider', 'model'] as const;
type UsageFilterGroup = (typeof FILTER_GROUPS)[number];
type UsageFilterScope = Extract<AiUsageRecordStatsGroupIdentity, { groupBy: UsageFilterGroup }>;
export type UsageFilterScopes = Partial<Record<UsageFilterGroup, UsageFilterScope>>;

export function AiUsageFilters({
  range,
  scopes,
  onChange,
}: {
  range: UsageRange;
  scopes: UsageFilterScopes;
  onChange: (scopes: UsageFilterScopes) => void;
}) {
  const { t } = useTranslation();
  const [field, setField] = useState<UsageFilterGroup>();
  const closePicker = () => setField(undefined);
  const selectScope = (group: UsageFilterGroup, scope: UsageFilterScope) => {
    const next = { ...scopes };
    const selected = scopes[group];
    delete next[group];
    // A filter can be cleared by choosing its selected item again.
    if (!selected || usageGroupKey(selected) !== usageGroupKey(scope)) {
      for (const providerGroup of FILTER_GROUPS) {
        const current = next[providerGroup];
        if (current && current.providerId !== scope.providerId) delete next[providerGroup];
      }
      next[group] = scope;
    }
    onChange(next);
    closePicker();
  };
  const selectedModel = scopes.model?.groupBy === 'model' ? scopes.model : undefined;

  return (
    <>
      <View className="flex-row items-center gap-5" testID="ai-usage-filters">
        {FILTER_GROUPS.map((group) => {
          const selected = scopes[group];
          const label = t(GROUP_LABELS[group]);
          const value = selected ? usageGroupLabel(selected, t) : label;
          return (
            <View
              className={group === 'provider' ? 'min-w-0 max-w-[40%] shrink' : 'min-w-0 flex-1'}
              key={group}
            >
              <SelectField
                accessibilityLabel={`${label}: ${selected ? value : t('aiUsage.all')}`}
                accessibilityState={{ expanded: field === group, selected: !!selected }}
                className="min-h-11 border-0 bg-transparent px-0 py-1"
                onPress={() => setField(group)}
                testID={`ai-usage-filter-${group}`}
              >
                {selected?.groupBy === 'provider' ? (
                  <ProviderAvatar
                    providerId={selected.providerId ?? ''}
                    providerName={value}
                    size={24}
                  />
                ) : selected?.groupBy === 'model' ? (
                  <ModelAvatar
                    model={{
                      id: `${selected.providerId ?? ''}::${selected.modelId ?? ''}`,
                      modelId: selected.modelId ?? '',
                      name: value,
                      providerId: selected.providerId ?? '',
                    }}
                    size={24}
                  />
                ) : null}
                <SelectField.ValueText
                  className="text-left font-medium text-sm"
                  ellipsizeMode="middle"
                  numberOfLines={1}
                >
                  {value}
                </SelectField.ValueText>
                <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
              </SelectField>
            </View>
          );
        })}
      </View>
      {field === 'model' ? (
        <ModelPickerDrawer
          modelType="all"
          onClose={closePicker}
          onSelect={(item) =>
            selectScope('model', {
              groupBy: 'model',
              modelId: item.model.modelId,
              providerId: item.provider.id,
              providerName: item.provider.name,
            })
          }
          open
          providerId={scopes.provider?.providerId ?? undefined}
          selectedModelId={
            selectedModel?.providerId && selectedModel.modelId
              ? `${selectedModel.providerId}::${selectedModel.modelId}`
              : null
          }
          variant="chat"
        />
      ) : field === 'provider' ? (
        <AiUsageProviderOptions
          range={range}
          selected={scopes.provider}
          onClose={closePicker}
          onSelect={(scope) => selectScope('provider', scope)}
        />
      ) : null}
    </>
  );
}

function AiUsageProviderOptions({
  range,
  selected,
  onClose,
  onSelect,
}: {
  range: UsageRange;
  selected?: UsageFilterScope;
  onClose: () => void;
  onSelect: (scope: UsageFilterScope) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const query = useQuery('/ai-usage-records/analytics', {
    query: {
      from: range.from,
      to: range.to,
      search: search.trim() || undefined,
      groupBy: 'provider',
      metric: 'requests',
      limit: 50,
    },
  });
  const options = query.data?.stats.buckets ?? [];
  const buckets = selected
    ? [selected, ...options.filter((bucket) => usageGroupKey(bucket) !== usageGroupKey(selected))]
    : options;

  return (
    <ProviderPickerDrawer
      emptyText={query.isError ? '' : t('aiUsage.noMatches')}
      isLoading={query.isLoading}
      loadingText={t('aiUsage.loading')}
      onClose={onClose}
      onSearchTextChange={(value) => setSearch(value.slice(0, 200))}
      onSelect={(item) => {
        const bucket = buckets.find((candidate) => usageGroupKey(candidate) === item.key);
        if (bucket?.groupBy === 'provider') onSelect(bucket);
      }}
      open
      providers={buckets.flatMap((bucket) =>
        bucket.groupBy === 'provider'
          ? [
              {
                key: usageGroupKey(bucket),
                provider: { id: bucket.providerId ?? '', name: usageGroupLabel(bucket, t) },
              },
            ]
          : [],
      )}
      searchPlaceholder={t('aiUsage.searchFilter', { name: t(GROUP_LABELS.provider) })}
      searchText={search}
      selectedProviderKey={selected ? usageGroupKey(selected) : null}
      title={t(GROUP_LABELS.provider)}
    >
      {query.isLoading && selected ? <ContentState.Loading title={t('aiUsage.loading')} /> : null}
      {query.isError ? (
        <ContentState.Error
          title={t('aiUsage.loadError')}
          primaryAction={{ children: t('aiUsage.retry'), onPress: () => void query.refetch() }}
        />
      ) : selected && options.length === 0 ? (
        <Text className="py-4 text-center text-muted-foreground text-sm">
          {t('aiUsage.noMatches')}
        </Text>
      ) : null}
      {query.data?.stats.other.recordCount ? (
        <Text className="px-6 py-3 text-muted-foreground text-xs">{t('aiUsage.refineSearch')}</Text>
      ) : null}
    </ProviderPickerDrawer>
  );
}
