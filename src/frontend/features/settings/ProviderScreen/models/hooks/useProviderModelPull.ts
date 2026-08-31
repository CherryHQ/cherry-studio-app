import { useAlert } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys, useBackendModule } from '@/frontend/data';
import { isModelPullTimeoutError } from '@/shared/contracts';
import type { Model, UniqueModelId } from '@/shared/data/types/model';

import type { ProviderModelPullPreview } from '../utils/providerModelPullPreview';
import { refreshProviderModelQueries } from '../utils/refreshProviderModelQueries';

type UseProviderModelPullOptions = {
  providerId: string;
};

/**
 * How a pull ended. The caller renders it — the screen a pull runs on has room
 * for a full state, and an alert or a toast on top of that would say the same
 * thing twice. `timedOut` is split from `failed` because it is the one failure
 * worth telling apart: the endpoint answered, just not in time.
 */
export type ProviderModelPullLoadResult = 'empty' | 'failed' | 'ready' | 'timedOut';

export function useProviderModelPull({ providerId }: UseProviderModelPullOptions) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const models = useBackendModule('models');
  const queryClient = useQueryClient();
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<ProviderModelPullPreview | null>(null);

  const loadPullPreview = useCallback(async (): Promise<ProviderModelPullLoadResult> => {
    if (!providerId) {
      return 'failed';
    }

    setIsPreviewLoading(true);
    const load = async (): Promise<ProviderModelPullLoadResult> => {
      const result = await models.pull(providerId);

      if (result.status === 'up-to-date') {
        setPreview(null);
        if (result.providerEnabled) {
          await refreshProviderQueries(queryClient, providerId);
        }
        return 'empty';
      }

      setPreview(result.preview);
      return 'ready';
    };
    return await load()
      .catch(
        (error): ProviderModelPullLoadResult =>
          isModelPullTimeoutError(error) ? 'timedOut' : 'failed',
      )
      .finally(() => setIsPreviewLoading(false));
  }, [models, providerId, queryClient]);

  /** Commits the selected additions and removals after the explicit Save action. */
  const applyModelChange = useCallback(
    async ({ toAdd = [], toRemove = [] }: { toAdd?: Model[]; toRemove?: UniqueModelId[] }) => {
      if (toAdd.length === 0 && toRemove.length === 0) {
        return false;
      }

      try {
        const result = await models.reconcile(providerId, { toAdd, toRemove });
        await refreshProviderModelQueries(queryClient, providerId);
        if (result.providerEnabled) {
          await refreshProviderQueries(queryClient, providerId);
        }
        return true;
      } catch {
        alert.show({ title: t('settings.provider.models.pullApplyFailed') });
        return false;
      }
    },
    [alert, models, providerId, queryClient, t],
  );

  return {
    applyModelChange,
    isPreviewLoading,
    loadPullPreview,
    preview,
  };
}

async function refreshProviderQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  providerId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.detail(providerId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.providers.page() }),
  ]);
}
