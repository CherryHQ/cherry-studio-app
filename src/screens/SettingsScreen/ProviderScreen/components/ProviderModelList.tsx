import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

import type { Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';
import { SettingsDialogActionButton } from '../../components/SettingsDialogActionButton';
import { ProviderModelAccordion } from '../models/components/ProviderModelAccordion';
import { ProviderModelSearchField } from '../models/components/ProviderModelSearchField';
import { useProviderModelGroups } from '../models/hooks/useProviderModelGroups';
import type { ProviderModelAction } from '../models/types';

type ProviderModelListProps = {
  isLoading: boolean;
  models: Model[];
  provider: Provider | undefined;
  /** The bottom toolbar's pull, surfaced again as the empty list's call to action. */
  pullAction?: ProviderModelAction;
};

export function ProviderModelList({
  isLoading,
  models,
  provider,
  pullAction,
}: ProviderModelListProps) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const { displayedExpandedValues, groups, isSearching, setExpandedValues } =
    useProviderModelGroups({ models, searchText });

  // A provider with no models at all has nothing to search and nothing to say, so
  // the search field and the "no models" line both give way to the pull itself.
  const hasNoModels = !isLoading && models.length === 0;

  return (
    <ProviderModelAccordion
      displayedExpandedValues={displayedExpandedValues}
      groups={groups}
      ListEmptyComponent={
        hasNoModels && pullAction ? (
          <ProviderModelPullCta action={pullAction} />
        ) : (
          <ProviderModelEmptyState
            title={
              isLoading
                ? t('settings.provider.models.loading')
                : isSearching
                  ? t('settings.provider.models.search.empty')
                  : t('settings.provider.models.empty')
            }
          />
        )
      }
      // Swapping the header rather than the whole tree keeps the underlying list
      // mounted, so its automatic content inset survives the transition.
      ListHeaderComponent={
        hasNoModels ? undefined : (
          // `pb-3` rather than `py-5`: the gap down to the list is the same one
          // the pull screen keeps between every control and the list below it.
          <View className="px-4 pt-5 pb-3">
            <ProviderModelSearchField searchText={searchText} setSearchText={setSearchText} />
          </View>
        )
      }
      provider={provider}
      onExpandedValuesChange={setExpandedValues}
      onScrollBeginDrag={Keyboard.dismiss}
    />
  );
}

function ProviderModelPullCta({ action }: { action: ProviderModelAction }) {
  const { t } = useTranslation();

  return (
    <View className="items-center px-4 py-5">
      <SettingsDialogActionButton
        isDisabled={action.isDisabled || action.isLoading}
        isLoading={action.isLoading}
        isPrimary
        label={t('settings.provider.models.emptyAction')}
        onPress={action.onPress}
      />
    </View>
  );
}

function ProviderModelEmptyState({ title }: { title: string }) {
  return (
    <View className="mx-4 min-h-12 justify-center rounded-2xl bg-settings-grouped-surface px-4 py-4">
      <Text className="text-base text-default-foreground">{title}</Text>
    </View>
  );
}
