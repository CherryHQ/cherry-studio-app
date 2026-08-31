import { ContentState } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { ProviderModelListContent } from '../models/components/ProviderModelListContent';

type ProviderModelListProps = {
  groupByPurpose?: boolean;
  isFiltered?: boolean;
  isLoading: boolean;
  models: Model[];
  provider: Provider | undefined;
};

export function ProviderModelList({
  groupByPurpose = false,
  isFiltered = false,
  isLoading,
  models,
  provider,
}: ProviderModelListProps) {
  const { t } = useTranslation();
  const hasNoVisibleModels = !isLoading && models.length === 0;

  return (
    <ProviderModelListContent
      groupByPurpose={groupByPurpose}
      ListEmptyComponent={
        hasNoVisibleModels && isFiltered ? (
          <ContentState.Empty
            className="flex-1 px-6 pb-24"
            title={t('settings.provider.models.search.empty')}
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
