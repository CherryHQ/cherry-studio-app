import { ContentState } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import {
  ProviderModelListContent,
  type ProviderModelListSelection,
} from '../models/components/ProviderModelListContent';
import type { ProviderModelAction } from '../models/types';

type ProviderModelListProps = {
  addAction?: ProviderModelAction;
  groupByPurpose?: boolean;
  isDefaultModel: (model: Model) => boolean;
  isFiltered?: boolean;
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
  groupByPurpose = false,
  isDefaultModel,
  isFiltered = false,
  isLoading,
  models,
  provider,
  pullAction,
  selection,
}: ProviderModelListProps) {
  const { t } = useTranslation();
  const hasNoVisibleModels = !isLoading && models.length === 0;

  return (
    <ProviderModelListContent
      groupByPurpose={groupByPurpose}
      isDefaultModel={isDefaultModel}
      ListEmptyComponent={
        hasNoVisibleModels && isFiltered ? (
          <ContentState.Empty
            className="flex-1 px-6 pb-24"
            title={t('settings.provider.models.search.empty')}
          />
        ) : hasNoVisibleModels && pullAction && addAction ? (
          <ContentState.Empty
            className="flex-1 px-6 pb-24"
            primaryAction={{
              children: t('settings.provider.models.emptyAction'),
              disabled: pullAction.isDisabled,
              loading: pullAction.isLoading,
              onPress: pullAction.onPress,
              size: 'default',
            }}
            secondaryAction={{
              children: t('settings.provider.models.addSubmit'),
              disabled: addAction.isDisabled,
              loading: addAction.isLoading,
              onPress: addAction.onPress,
              size: 'default',
            }}
            title={t('settings.provider.models.empty')}
          />
        ) : (
          <ProviderModelStateCard>
            {isLoading ? (
              <ContentState.Loading
                className="flex-row justify-start gap-3"
                title={t('settings.provider.models.loading')}
              />
            ) : (
              <ContentState.Empty
                className="items-start"
                title={t('settings.provider.models.empty')}
              />
            )}
          </ProviderModelStateCard>
        )
      }
      models={models}
      provider={provider}
      selection={selection}
    />
  );
}

function ProviderModelStateCard({ children }: { children: ReactNode }) {
  return (
    <View className="mx-4 min-h-12 justify-center rounded-2xl bg-grouped-surface px-4 py-4">
      {children}
    </View>
  );
}
