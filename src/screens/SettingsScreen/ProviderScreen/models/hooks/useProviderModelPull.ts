import { useQueryClient } from '@tanstack/react-query';
import { useToast } from 'heroui-native/toast';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys } from '@/data/api';
import { useDataServices } from '@/data/runtime';
import { providerRegistryService } from '@/data/services/ProviderRegistryService';
import type { Provider } from '@/data/types/provider';

import {
  buildProviderModelPullPreview,
  type ProviderModelPullApplyPayload,
  type ProviderModelPullPreview,
} from '../utils/providerModelPullPreview';
import {
  isProviderModelPullTimeoutError,
  withProviderModelPullTimeout,
} from '../utils/providerModelPullTimeout';

type UseProviderModelPullOptions = {
  provider: Provider | undefined;
  providerId: string;
};

export function useProviderModelPull({ provider, providerId }: UseProviderModelPullOptions) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const services = useDataServices();
  const queryClient = useQueryClient();
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [preview, setPreview] = useState<ProviderModelPullPreview | null>(null);

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false);
  }, []);

  const resetPreview = useCallback(() => {
    setPreview(null);
    setIsSheetOpen(false);
  }, []);

  const refreshModelQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.models.list({ providerId }) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.models.list({ enabled: true, providerId }),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.models.list() }),
    ]);
  }, [providerId, queryClient]);

  const openPullPreview = useCallback(async () => {
    if (!provider || !providerId) {
      return;
    }

    setIsPreviewLoading(true);
    try {
      const [localModels, remoteModels] = await withProviderModelPullTimeout((signal) =>
        Promise.all([
          services.model.list({ providerId }),
          services.ai.listModels({
            providerId,
            requestOptions: { signal },
            throwOnError: true,
          }),
        ]),
      );
      const nextPreview = buildProviderModelPullPreview({
        localModels,
        providerId,
        registryResolver: (modelId) =>
          providerRegistryService.lookupModel(providerId, modelId, {
            defaultChatEndpoint: provider.defaultChatEndpoint,
            endpointConfigs: provider.endpointConfigs,
          }),
        remoteModels,
      });
      const hasChanges = nextPreview.added.length > 0 || nextPreview.missing.length > 0;

      if (!hasChanges) {
        setPreview(null);
        toast.show({
          label: t('settings.provider.models.pullUpToDate'),
          variant: 'success',
        });
        return;
      }

      setPreview(nextPreview);
      setIsSheetOpen(true);
    } catch (error) {
      toast.show({
        label: t(
          isProviderModelPullTimeoutError(error)
            ? 'settings.provider.models.pullTimedOut'
            : 'settings.provider.models.pullFailed',
        ),
        variant: 'danger',
      });
    } finally {
      setIsPreviewLoading(false);
    }
  }, [provider, providerId, services.ai, services.model, t, toast]);

  const applyPullPreview = useCallback(
    async (payload: ProviderModelPullApplyPayload) => {
      if (!provider) {
        return;
      }

      setIsApplying(true);
      try {
        const result = await services.model.reconcileProviderModels(providerId, payload, {
          defaultChatEndpoint: provider.defaultChatEndpoint,
          endpointConfigs: provider.endpointConfigs,
        });
        await refreshModelQueries();
        toast.show({
          label: t('settings.provider.models.pullApplyResult', {
            added: result.added.length,
            removed: result.removedIds.length,
          }),
          variant: 'success',
        });
        resetPreview();
      } catch {
        toast.show({
          label: t('settings.provider.models.pullApplyFailed'),
          variant: 'danger',
        });
      } finally {
        setIsApplying(false);
      }
    },
    [provider, providerId, refreshModelQueries, resetPreview, services.model, t, toast],
  );

  return {
    applyPullPreview,
    closeSheet,
    isApplying,
    isBusy: isPreviewLoading || isApplying,
    isPreviewLoading,
    isSheetOpen,
    openPullPreview,
    preview,
  };
}
