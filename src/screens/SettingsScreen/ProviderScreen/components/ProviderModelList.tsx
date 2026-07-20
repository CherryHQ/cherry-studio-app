import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';

import type { Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';
import { ProviderModelAccordion } from '../models/components/ProviderModelAccordion';
import { ProviderModelSearchField } from '../models/components/ProviderModelSearchField';
import {
  ProviderModelToolbar,
  type ProviderModelToolbarActions,
} from '../models/components/ProviderModelToolbar';
import { useProviderModelGroups } from '../models/hooks/useProviderModelGroups';

type ProviderModelListProps = {
  header?: ReactElement;
  isLoading: boolean;
  models: Model[];
  provider: Provider | undefined;
  toolbarActions: ProviderModelToolbarActions;
};

export function ProviderModelList({
  header,
  isLoading,
  models,
  provider,
  toolbarActions,
}: ProviderModelListProps) {
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
        <View className="gap-6 px-4 py-5">
          {header}
          <View className="gap-3">
            <ProviderModelToolbar actions={toolbarActions} />
            <ProviderModelSearchField searchText={searchText} setSearchText={setSearchText} />
          </View>
        </View>
      }
      provider={provider}
      onExpandedValuesChange={setExpandedValues}
      onScrollBeginDrag={Keyboard.dismiss}
    />
  );
}
