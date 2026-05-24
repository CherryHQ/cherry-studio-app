import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { Model } from '@/data/types/model';
import {
  ProviderModelAccordion,
  ProviderModelSearchField,
  ProviderModelToolbar,
  useProviderModelGroups,
} from '../models';

type ProviderModelListProps = {
  isLoading: boolean;
  models: Model[];
};

export function ProviderModelList({ isLoading, models }: ProviderModelListProps) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const { displayedExpandedValues, groups, isSearching, setExpandedValues } =
    useProviderModelGroups({ models, searchText });

  const emptyTitle = isLoading
    ? t('settings.provider.models.loading')
    : isSearching
      ? t('settings.provider.models.search.empty')
      : t('settings.provider.models.empty');

  return (
    <View className="gap-3">
      <ProviderModelToolbar />
      <ProviderModelSearchField searchText={searchText} setSearchText={setSearchText} />

      {groups.length > 0 ? (
        <ProviderModelAccordion
          displayedExpandedValues={displayedExpandedValues}
          groups={groups}
          onExpandedValuesChange={setExpandedValues}
        />
      ) : (
        <View className="min-h-12 justify-center rounded-2xl bg-surface-secondary px-4 py-4">
          <Text className="text-base text-default-foreground">{emptyTitle}</Text>
        </View>
      )}
    </View>
  );
}
