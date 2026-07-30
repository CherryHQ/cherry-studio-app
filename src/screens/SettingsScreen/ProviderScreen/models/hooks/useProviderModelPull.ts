import { useQueryClient } from '@tanstack/react-query';
import { useToast } from 'heroui-native/toast';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { providerRegistryService } from '@/data/services/ProviderRegistryService';
import type { UpdateProviderInput } from '@/data/services/ProviderService';
import type { Model, UniqueModelId } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';
import { useDataServices } from '@/runtime';

import { enableProviderWhenModelsAvailable } from '../../utils/providerEnablement';
import {
  buildProviderModelPullPreview,
  modelToCreateModelInput,
  type ProviderModelPullPreview,
} from '../utils/providerModelPullPreview';
import {
  isProviderModelPullTimeoutError,
  withProviderModelPullTimeout,
} from '../utils/providerModelPullTimeout';
import { refreshProviderModelQueries } from '../utils/refreshProviderModelQueries';

type UseProviderModelPullOptions = {
  initialPreview?: ProviderModelPullPreview | null;
  onPreviewReady?: (preview: ProviderModelPullPreview) => void;
  provider: Provider | undefined;
  providerId: string;
};

export type ProviderModelPullLoadResult = 'empty' | 'error' | 'ready';

export function useProviderModelPull({
  initialPreview = null,
  onPreviewReady,
  provider,
  providerId,
}: UseProviderModelPullOptions) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const services = useDataServices();
  const queryClient = useQueryClient();
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<ProviderModelPullPreview | null>(initialPreview);

  const loadPullPreview = useCallback(async (): Promise<ProviderModelPullLoadResult> => {
    if (!provider || !providerId) {
      return 'error';
    }

    setIsPreviewLoading(true);
    const load = async (): Promise<ProviderModelPullLoadResult> => {
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
      onPreviewReady?.(nextPreview);
      return 'ready';
    };
    return await load()
      .catch((error): ProviderModelPullLoadResult => {
        toast.show({
          label: t(
            isProviderModelPullTimeoutError(error)
              ? 'settings.provider.models.pullTimedOut'
              : 'settings.provider.models.pullFailed',
          ),
          variant: 'danger',
        });
        return 'error';
      })
      .finally(() => setIsPreviewLoading(false));
  }, [
    onPreviewReady,
    provider,
    providerId,
    services.ai,
    services.model,
    services.provider,
    t,
    toast,
  ]);

  /**
   * Commits one row's worth of change immediately, the way desktop's pull dialog
   * does. There is no submit step: the preview stays on screen and the row just
   * flips its glyph. Success is silent, since a toast per tap would be unusable
   * when adding models one after another.
   */
  const applyModelChange = useCallback(
    async ({ toAdd = [], toRemove = [] }: { toAdd?: Model[]; toRemove?: UniqueModelId[] }) => {
      if (!provider || (toAdd.length === 0 && toRemove.length === 0)) {
        return false;
      }

      try {
        await services.model.reconcileProviderModels(
          providerId,
          { toAdd: toAdd.map(modelToCreateModelInput), toRemove },
          {
            defaultChatEndpoint: provider.defaultChatEndpoint,
            endpointConfigs: provider.endpointConfigs,
          },
        );
        // The models just landed, so the count is known without re-reading the table.
        await enableProviderWhenModelsAvailable(
          provider,
          (updates: UpdateProviderInput) => services.provider.update(providerId, updates),
          toAdd.length,
          'pull_reconcile_row',
        );
        await refreshProviderModelQueries(queryClient, providerId);
        return true;
      } catch {
        toast.show({ label: t('settings.provider.models.pullApplyFailed'), variant: 'danger' });
        return false;
      }
    },
    [provider, providerId, queryClient, services.model, services.provider, t, toast],
  );

  return {
    applyModelChange,
    isPreviewLoading,
    loadPullPreview,
    preview,
  };
}
