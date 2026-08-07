import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from 'heroui-native/toast';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys, useBackendModule } from '@/frontend/data';
import { isModelPullTimeoutError } from '@/shared/contracts';

import type { ProviderModelPullPreview } from '../utils/providerModelPullPreview';
import { refreshProviderModelQueries } from '../utils/refreshProviderModelQueries';

type UseProviderModelPullOptions = {
  initialPreview?: ProviderModelPullPreview | null;
  onPreviewReady?: (preview: ProviderModelPullPreview) => void;
  providerId: string;
};

export type ProviderModelPullLoadResult = 'empty' | 'error' | 'ready';

export function useProviderModelPull({
  initialPreview = null,
  onPreviewReady,
  providerId,
}: UseProviderModelPullOptions) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const models = useBackendModule('models');
  const queryClient = useQueryClient();
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<ProviderModelPullPreview | null>(initialPreview);

  const loadPullPreview = useCallback(async (): Promise<ProviderModelPullLoadResult> => {
    if (!providerId) {
      return 'error';
    }

    setIsPreviewLoading(true);
    const load = async (): Promise<ProviderModelPullLoadResult> => {
      const result = await models.pull(providerId);

      if (result.status === 'up-to-date') {
        setPreview(null);
        if (result.providerEnabled) {
          await refreshProviderQueries(queryClient, providerId);
        }
        toast.show({
          label: t('settings.provider.models.pullUpToDate'),
          variant: 'success',
        });
        return 'empty';
      }

      setPreview(result.preview);
      onPreviewReady?.(result.preview);
      return 'ready';
    };
    return await load()
      .catch((error): ProviderModelPullLoadResult => {
        toast.show({
          label: t(
            isModelPullTimeoutError(error)
              ? 'settings.provider.models.pullTimedOut'
              : 'settings.provider.models.pullFailed',
          ),
          variant: 'danger',
        });
        return 'error';
      })
      .finally(() => setIsPreviewLoading(false));
  }, [onPreviewReady, models, providerId, queryClient, t, toast]);

  /**
   * Commits one row's worth of change immediately, the way desktop's pull dialog
   * does. There is no submit step: the preview stays on screen and the row just
   * flips its glyph. Success is silent, since a toast per tap would be unusable
   * when adding models one after another.
   */
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
        toast.show({ label: t('settings.provider.models.pullApplyFailed'), variant: 'danger' });
        return false;
      }
    },
    [models, providerId, queryClient, t, toast],
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
  ]);
}
