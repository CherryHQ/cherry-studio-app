import {
  ContentState,
  OptionPickerBottomSheet,
  type OptionPickerOption,
  useToast,
} from '@cherrystudio/ui/components';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useReorder } from '@/frontend/data';
import { dataApiCollectionFilters } from '@/frontend/data/utils/optimisticQueryUpdate';
import { applySublistOrderToList } from '@/frontend/data/utils/reorder';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { ProviderModelListContent } from '../../models/components/ProviderModelListContent';
import { useProviderModelEndpointUpdate } from '../../models/hooks/useProviderModelEndpointUpdate';
import type { useProviderModelManagement } from '../../models/hooks/useProviderModelManagement';
import {
  getProviderModelEndpointSelection,
  getProviderModelEndpointOptions,
  type ProviderModelEndpointSelection,
} from '../../models/utils/providerModelEndpoint';

type ProviderModelListProps = {
  groupByPurpose?: boolean;
  isEndpointSelectionDisabled?: boolean;
  isFiltered?: boolean;
  isLoading: boolean;
  isSearchActive?: boolean;
  supportedModelIds?: ReadonlySet<string>;
  management?: ReturnType<typeof useProviderModelManagement>;
  models: Model[];
  visibleModels?: Model[];
  onAddModelManually?: () => void;
  onPullModels?: () => void;
  provider: Provider | undefined;
};

export function ProviderModelList({
  groupByPurpose = false,
  isEndpointSelectionDisabled = false,
  isFiltered = false,
  isLoading,
  isSearchActive = false,
  management,
  supportedModelIds,
  models,
  visibleModels = models,
  onAddModelManually,
  onPullModels,
  provider,
}: ProviderModelListProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedModel, setSelectedModel] = useState<Model>();
  const { updateEndpoint, updatingModelId } = useProviderModelEndpointUpdate(provider?.id ?? '');
  const { reorder } = useReorder<Model>({
    getId: (model) => model.id,
    onError: () => toast.show({ label: t('common.reorderFailed'), variant: 'danger' }),
    queryFilters: [dataApiCollectionFilters('/models')],
    resource: '/models',
  });
  const reorderVisibleModels = useCallback(
    (ordered: readonly Model[]) => {
      const next = applySublistOrderToList(
        models,
        ordered.map((model) => model.id),
        (model) => model.id,
      );
      return reorder(models, next);
    },
    [models, reorder],
  );
  const canReorder =
    Boolean(management) && !isSearchActive && !management?.isSelecting && !management?.isDeleting;
  const hasNoVisibleModels = !isLoading && visibleModels.length === 0;
  const closeEndpointPicker = useCallback(() => setSelectedModel(undefined), []);
  const openEndpointPicker = useCallback((model: Model) => setSelectedModel(model), []);
  const endpointOptions = useMemo<OptionPickerOption<ProviderModelEndpointSelection>[]>(
    () => (provider ? getProviderModelEndpointOptions(provider, t) : []),
    [provider, t],
  );
  const handleEndpointChange = useCallback(
    (selection: ProviderModelEndpointSelection) => {
      if (selectedModel) {
        void updateEndpoint(selectedModel, selection);
      }
    },
    [selectedModel, updateEndpoint],
  );

  return (
    <>
      <ProviderModelListContent
        canReorder={canReorder}
        groupByPurpose={groupByPurpose}
        management={management}
        onReorderModels={reorderVisibleModels}
        supportedModelIds={supportedModelIds}
        isEndpointSelectionDisabled={isEndpointSelectionDisabled}
        ListEmptyComponent={
          hasNoVisibleModels && isFiltered ? (
            <View className="flex-1 justify-center px-6 pb-24">
              <ContentState.Empty title={t('settings.provider.models.search.empty')} />
            </View>
          ) : (
            <ProviderModelStateCard>
              {isLoading ? (
                <ContentState.Loading layout="row" title={t('settings.provider.models.loading')} />
              ) : (
                <ContentState.Empty
                  description={t('settings.provider.models.emptyDescription')}
                  layout="leading"
                  primaryAction={
                    onPullModels
                      ? {
                          children: t('settings.provider.models.emptyAction'),
                          onPress: onPullModels,
                        }
                      : undefined
                  }
                  secondaryAction={
                    onAddModelManually
                      ? {
                          children: t('settings.provider.models.addTitle'),
                          onPress: onAddModelManually,
                        }
                      : undefined
                  }
                  title={t('settings.provider.models.empty')}
                />
              )}
            </ProviderModelStateCard>
          )
        }
        models={visibleModels}
        onEndpointPress={openEndpointPicker}
        provider={provider}
        updatingModelId={updatingModelId}
      />
      {selectedModel ? (
        <OptionPickerBottomSheet
          helperText={t('settings.provider.models.endpoint.helper')}
          onClose={closeEndpointPicker}
          onValueChange={handleEndpointChange}
          open
          options={endpointOptions}
          selectedValue={getProviderModelEndpointSelection(selectedModel)}
          size="compact"
          title={t('settings.provider.models.endpoint.title')}
        />
      ) : null}
    </>
  );
}

function ProviderModelStateCard({ children }: { children: ReactNode }) {
  return (
    <View className="mx-4 min-h-12 justify-center rounded-2xl bg-card px-4 py-4">{children}</View>
  );
}
