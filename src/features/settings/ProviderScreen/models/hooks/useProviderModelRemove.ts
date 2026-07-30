import { useQueryClient } from '@tanstack/react-query';
import { useToast } from 'heroui-native/toast';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/data/hooks';
import type { Model, UniqueModelId } from '@/data/types/model';
import { useDataServices } from '@/runtime';

import { refreshProviderModelQueries } from '../utils/refreshProviderModelQueries';

const emptyModelIdSet: ReadonlySet<UniqueModelId> = new Set();

/**
 * Removing a model from its provider, one tap and no confirmation — the same
 * bargain desktop's list makes. What is undone by pulling the list again does
 * not warrant a dialog in the way deleting the provider does.
 *
 * The chat default is the one row that cannot go: the service refuses it, and
 * `isDefaultModel` lets the list grey the affordance out rather than let the
 * tap fail.
 */
export function useProviderModelRemove(providerId: string) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const services = useDataServices();
  const queryClient = useQueryClient();
  const [defaultModelId] = usePreference('chat.default_model_id');
  const [removingIds, setRemovingIds] = useState<ReadonlySet<UniqueModelId>>(emptyModelIdSet);

  const removeModel = useCallback(
    async (model: Model) => {
      if (removingIds.has(model.id)) {
        return;
      }

      setRemovingIds((current) => new Set(current).add(model.id));
      try {
        const didRemove = await services.model.delete(model.id);
        if (!didRemove) {
          toast.show({ label: t('settings.provider.models.removeFailed'), variant: 'danger' });
          return;
        }

        await refreshProviderModelQueries(queryClient, providerId);
      } catch {
        toast.show({ label: t('settings.provider.models.removeFailed'), variant: 'danger' });
      } finally {
        setRemovingIds((current) => {
          const next = new Set(current);
          next.delete(model.id);
          return next;
        });
      }
    },
    [providerId, queryClient, removingIds, services.model, t, toast],
  );

  return {
    isDefaultModel: useCallback((model: Model) => model.id === defaultModelId, [defaultModelId]),
    removeModel,
    removingIds,
  };
}
