import { Button } from '@cherrystudio/ui/components';
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { type ProviderModelListSelection } from '../models/components/ProviderModelListContent';
import { ProviderModelListLayout } from '../models/components/ProviderModelListLayout/ProviderModelListLayout';
import type { ProviderModelAction } from '../models/types';
import { filterModelsByKeywords } from '../models/utils/providerModelSearch';

type ProviderModelListProps = {
  addAction?: ProviderModelAction;
  isDefaultModel: (model: Model) => boolean;
  isLoading: boolean;
  models: Model[];
  provider: Provider | undefined;
  /** The bottom toolbar's pull, surfaced again as the empty list's call to action. */
  pullAction?: ProviderModelAction;
  /** Given while the screen is selecting; the rows become checkboxes. */
  selection?: ProviderModelListSelection;
};

export function ProviderModelList({
  addAction,
  isDefaultModel,
  isLoading,
  models,
  provider,
  pullAction,
  selection,
}: ProviderModelListProps) {
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const deferredSearchText = useDeferredValue(searchText);
  // A selection covers every model the provider has, so the list has to show
  // every one of them — select-all reaching past what a leftover search term
  // left on screen is how a model nobody can see gets deleted.
  const displayedModels = useMemo(
    () => (selection ? models : filterModelsByKeywords(deferredSearchText, models)),
    [deferredSearchText, models, selection],
  );
  const isSearching = searchText.trim().length > 0;

  // A provider with no models at all has nothing to search and nothing to say, so
  // the search field and the "no models" line both give way to the pull itself.
  const hasNoModels = !isLoading && models.length === 0;

  return (
    <>
      <ProviderModelListLayout
        isDefaultModel={isDefaultModel}
        ListEmptyComponent={
          hasNoModels && pullAction && addAction ? (
            <ProviderModelEmptyActions addAction={addAction} pullAction={pullAction} />
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
        models={displayedModels}
        provider={provider}
        searchText={searchText}
        selection={selection}
        setSearchText={setSearchText}
        // Searching while selecting would hide rows that stay selected, so the
        // field goes away for the duration.
        showSearch={!hasNoModels && !selection}
        onScrollBeginDrag={Keyboard.dismiss}
      />
    </>
  );
}

function ProviderModelEmptyActions({
  addAction,
  pullAction,
}: {
  addAction: ProviderModelAction;
  pullAction: ProviderModelAction;
}) {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center gap-4 px-6 pb-24">
      <Text className="text-center text-base text-foreground">
        {t('settings.provider.models.empty')}
      </Text>
      <View className="flex-row gap-3">
        <Button
          disabled={pullAction.isDisabled}
          loading={pullAction.isLoading}
          onPress={pullAction.onPress}
          variant="default"
        >
          <Button.Label>{t('settings.provider.models.emptyAction')}</Button.Label>
        </Button>
        <Button
          disabled={addAction.isDisabled}
          loading={addAction.isLoading}
          onPress={addAction.onPress}
          variant="secondary"
        >
          <Button.Label>{t('settings.provider.models.addSubmit')}</Button.Label>
        </Button>
      </View>
    </View>
  );
}

function ProviderModelEmptyState({ title }: { title: string }) {
  return (
    <View className="mx-4 min-h-12 justify-center rounded-2xl bg-grouped-surface px-4 py-4">
      <Text className="text-base text-foreground">{title}</Text>
    </View>
  );
}
