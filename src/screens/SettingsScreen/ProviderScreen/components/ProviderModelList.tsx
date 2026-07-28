import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';

import type { Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';
import { ProviderModelAccordion } from '../models/components/ProviderModelAccordion';
import { ProviderModelSearchField } from '../models/components/ProviderModelSearchField';
import { useProviderModelGroups } from '../models/hooks/useProviderModelGroups';

type ProviderModelListProps = {
  isLoading: boolean;
  models: Model[];
  provider: Provider | undefined;
};

export function ProviderModelList({ isLoading, models, provider }: ProviderModelListProps) {
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
    <ProviderModelAccordion
      displayedExpandedValues={displayedExpandedValues}
      emptyTitle={emptyTitle}
      groups={groups}
      ListHeaderComponent={
        <View className="px-4 py-5">
          <ProviderModelSearchField searchText={searchText} setSearchText={setSearchText} />
        </View>
      }
      provider={provider}
      onExpandedValuesChange={setExpandedValues}
      onScrollBeginDrag={Keyboard.dismiss}
    />
  );
}
