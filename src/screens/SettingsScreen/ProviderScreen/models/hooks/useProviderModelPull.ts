import { useQueryClient } from '@tanstack/react-query';
import { useToast } from 'heroui-native/toast';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys } from '@/data/api';
import { useDataServices } from '@/data/runtime';
import { providerRegistryService } from '@/data/services/ProviderRegistryService';
import type { UpdateProviderInput } from '@/data/services/ProviderService';
import type { Provider } from '@/data/types/provider';

import { enableProviderWhenModelsAvailable } from '../../utils/providerEnablement';
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

export type ProviderModelPullLoadResult = 'empty' | 'error' | 'ready';

export function useProviderModelPull({ provider, providerId }: UseProviderModelPullOptions) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const services = useDataServices();
  const queryClient = useQueryClient();
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [preview, setPreview] = useState<ProviderModelPullPreview | null>(null);

  const resetPreview = useCallback(() => {
    setPreview(null);
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

  const loadPullPreview = useCallback(async (): Promise<ProviderModelPullLoadResult> => {
    if (!provider || !providerId) {
      return 'error';
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
        await enableProviderWhenModelsAvailable(
          provider,
          (updates: UpdateProviderInput) => services.provider.update(providerId, updates),
          localModels.length,
          'pull_reconcile_up_to_date',
        );
        toast.show({
          label: t('settings.provider.models.pullUpToDate'),
          variant: 'success',
        });
        return 'empty';
      }

      setPreview(nextPreview);
      return 'ready';
    } catch (error) {
      toast.show({
        label: t(
          isProviderModelPullTimeoutError(error)
            ? 'settings.provider.models.pullTimedOut'
            : 'settings.provider.models.pullFailed',
        ),
        variant: 'danger',
      });
      return 'error';
    } finally {
      setIsPreviewLoading(false);
    }
  }, [provider, providerId, services.ai, services.model, services.provider, t, toast]);

  const applyPullPreview = useCallback(
    async (payload: ProviderModelPullApplyPayload) => {
      if (!provider) {
        return false;
      }

      setIsApplying(true);
      try {
        const result = await services.model.reconcileProviderModels(providerId, payload, {
          defaultChatEndpoint: provider.defaultChatEndpoint,
          endpointConfigs: provider.endpointConfigs,
        });
        const remainingModels = await services.model.list({ providerId });
        await enableProviderWhenModelsAvailable(
          provider,
          (updates: UpdateProviderInput) => services.provider.update(providerId, updates),
          remainingModels.length,
          'pull_reconcile_apply',
        );
        await refreshModelQueries();
        toast.show({
          label: t('settings.provider.models.pullApplyResult', {
            added: result.added.length,
            removed: result.removedIds.length,
          }),
          variant: 'success',
        });
        resetPreview();
        return true;
      } catch {
        toast.show({
          label: t('settings.provider.models.pullApplyFailed'),
          variant: 'danger',
        });
        return false;
      } finally {
        setIsApplying(false);
      }
    },
    [
      provider,
      providerId,
      refreshModelQueries,
      resetPreview,
      services.model,
      services.provider,
      t,
      toast,
    ],
  );

  return {
    applyPullPreview,
    isApplying,
    isBusy: isPreviewLoading || isApplying,
    isPreviewLoading,
    loadPullPreview,
    preview,
    resetPreview,
  };
}
