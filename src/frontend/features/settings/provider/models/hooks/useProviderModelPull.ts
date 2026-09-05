import { useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import {
  ModelPullError,
  ModelPullTimeoutError,
  ProviderSetupError,
  type ProviderConfigurationIssue,
} from '@/shared/contracts';
import type { Model, UniqueModelId } from '@/shared/data/types/model';

import type { ProviderModelPullPreview } from '../utils/providerModelPullPreview';
import { refreshProviderModelQueries } from '../utils/refreshProviderModelQueries';

export type ProviderModelPullLoadResult =
  | 'empty'
  | 'failed'
  | 'ready'
  | 'timedOut'
  | 'cancelled'
  | ModelPullError['reason']
  | ProviderConfigurationIssue;

export function useProviderModelPull({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const models = useBackendModule('models');
  const queryClient = useQueryClient();
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<ProviderModelPullPreview | null>(null);
  const request = useRef<AbortController | null>(null);
  const cancelPull = useCallback(() => {
    request.current?.abort();
    request.current = null;
  }, []);
  useEffect(() => cancelPull, [cancelPull]);

  const loadPullPreview = useCallback(async (): Promise<ProviderModelPullLoadResult> => {
    if (!providerId) return 'failed';
    cancelPull();
    const controller = new AbortController();
    request.current = controller;
    setPreview(null);
    setIsPreviewLoading(true);
    try {
      const result = await models.pull(providerId, controller.signal);
      if (controller.signal.aborted) return 'cancelled';
      if (result.status === 'up-to-date') return 'empty';
      setPreview(result.preview);
      return 'ready';
    } catch (error) {
      if (controller.signal.aborted) return 'cancelled';
      if (error instanceof ModelPullTimeoutError) return 'timedOut';
      if (error instanceof ModelPullError) return error.reason;
      if (error instanceof ProviderSetupError && error.reason !== 'no-models') return error.reason;
      return 'failed';
    } finally {
      if (request.current === controller) {
        request.current = null;
        setIsPreviewLoading(false);
      }
    }
  }, [cancelPull, models, providerId]);

  const applyModelChange = useCallback(
    async ({ toAdd = [], toRemove = [] }: { toAdd?: Model[]; toRemove?: UniqueModelId[] }) => {
      if (toAdd.length === 0 && toRemove.length === 0) return false;
      try {
        const result = await models.reconcile(providerId, { toAdd, toRemove });
        await refreshProviderModelQueries(queryClient, providerId);
        const skippedCount = toRemove.length - result.removedIds.length;
        if (skippedCount > 0) {
          toast.show({
            label: t('settings.provider.models.management.protectedSkipped', {
              count: skippedCount,
            }),
            variant: 'warning',
          });
        }
        return result.added.length + result.removedIds.length > 0;
      } catch {
        toast.show({ label: t('settings.provider.models.pullApplyFailed'), variant: 'danger' });
        return false;
      }
    },
    [models, providerId, queryClient, t, toast],
  );

  return { applyModelChange, cancelPull, isPreviewLoading, loadPullPreview, preview };
}
