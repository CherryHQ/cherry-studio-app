import { ContentState } from '@cherrystudio/ui/components';
import { useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { useQuery } from '@/frontend/data';
import {
  isUniqueModelId,
  parseUniqueModelId,
  type Model,
  type UniqueModelId,
} from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

export function ProviderModelPage({
  children,
}: {
  children: (model: Model, provider: Provider) => ReactNode;
}) {
  const { modelId, providerId } = useLocalSearchParams<{ modelId?: string; providerId?: string }>();
  const { t } = useTranslation();
  if (
    !providerId ||
    !modelId ||
    !isUniqueModelId(modelId) ||
    parseUniqueModelId(modelId).providerId !== providerId
  ) {
    return (
      <>
        <RouteHeader title={t('settings.provider.models.detail.title')} />
        <View className="px-6 py-10">
          <ContentState.Error title={t('settings.provider.models.management.loadFailed')} />
        </View>
      </>
    );
  }
  return (
    <LoadedProviderModel modelId={modelId} providerId={providerId}>
      {children}
    </LoadedProviderModel>
  );
}

function LoadedProviderModel({
  modelId,
  providerId,
  children,
}: {
  modelId: UniqueModelId;
  providerId: string;
  children: (model: Model, provider: Provider) => ReactNode;
}) {
  const { t } = useTranslation();
  const modelQuery = useQuery('/models/:uniqueModelId*', {
    params: { uniqueModelId: modelId },
    retry: false,
  });
  const providerQuery = useQuery('/providers/:id', { params: { id: providerId }, retry: false });
  // A failed background refresh must not unmount the editor and discard its draft.
  // Only the initial load owns whether the page content can be mounted.
  if (!modelQuery.data || !providerQuery.data) {
    return (
      <>
        <RouteHeader title={t('settings.provider.models.detail.title')} />
        <View className="px-6 py-10">
          {modelQuery.isError || providerQuery.isError ? (
            <ContentState.Error
              title={t('settings.provider.models.management.loadFailed')}
              primaryAction={{
                children: t('common.retry'),
                onPress: () => {
                  void modelQuery.refetch();
                  void providerQuery.refetch();
                },
              }}
            />
          ) : (
            <ContentState.Loading title={t('settings.provider.models.loading')} />
          )}
        </View>
      </>
    );
  }
  return children(modelQuery.data, providerQuery.data);
}
