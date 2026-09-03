import {
  ContentState,
  OptionPickerBottomSheet,
  type OptionPickerOption,
} from '@cherrystudio/ui/components';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { ProviderModelListContent } from '../../models/components/ProviderModelListContent';
import { useProviderModelEndpointUpdate } from '../../models/hooks/useProviderModelEndpointUpdate';
import {
  getProviderChatEndpointTypes,
  getProviderModelEndpointLabelKey,
} from '../../models/utils/providerModelAdd';
import {
  getProviderModelEndpointSelection,
  PROVIDER_DEFAULT_ENDPOINT_SELECTION,
  type ProviderModelEndpointSelection,
} from '../../models/utils/providerModelEndpoint';

type ProviderModelListProps = {
  groupByPurpose?: boolean;
  isEndpointSelectionDisabled?: boolean;
  isFiltered?: boolean;
  isLoading: boolean;
  models: Model[];
  onAddModelManually?: () => void;
  onPullModels?: () => void;
  provider: Provider | undefined;
};

export function ProviderModelList({
  groupByPurpose = false,
  isEndpointSelectionDisabled = false,
  isFiltered = false,
  isLoading,
  models,
  onAddModelManually,
  onPullModels,
  provider,
}: ProviderModelListProps) {
  const { t } = useTranslation();
  const [selectedModel, setSelectedModel] = useState<Model>();
  const { updateEndpoint, updatingModelId } = useProviderModelEndpointUpdate(provider?.id ?? '');
  const hasNoVisibleModels = !isLoading && models.length === 0;
  const closeEndpointPicker = useCallback(() => setSelectedModel(undefined), []);
  const openEndpointPicker = useCallback((model: Model) => setSelectedModel(model), []);
  const endpointOptions = useMemo<OptionPickerOption<ProviderModelEndpointSelection>[]>(() => {
    if (!provider) {
      return [];
    }

    const defaultEndpointLabel = provider.defaultChatEndpoint
      ? t(getProviderModelEndpointLabelKey(provider.defaultChatEndpoint))
      : t('settings.provider.models.endpoint.unavailable');
    return [
      {
        label: t('settings.provider.models.endpoint.followDefault', {
          endpoint: defaultEndpointLabel,
        }),
        value: PROVIDER_DEFAULT_ENDPOINT_SELECTION,
      },
      ...getProviderChatEndpointTypes(provider).map((endpointType) => ({
        label: t(getProviderModelEndpointLabelKey(endpointType)),
        value: endpointType,
      })),
    ];
  }, [provider, t]);
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
        groupByPurpose={groupByPurpose}
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
        models={models}
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
