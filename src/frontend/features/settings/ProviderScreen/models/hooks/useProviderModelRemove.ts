import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAlert } from '@/frontend/components/AlertProvider';
import { useMutation } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';

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
export function useProviderModelRemove() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const removeModelMutation = useMutation('DELETE', '/models/:uniqueModelId*', {
    refresh: ['/models'],
  });
  const deleteModel = removeModelMutation.trigger;
  const [defaultModelId] = usePreference('chat.default_model_id');
  const [removingIds, setRemovingIds] = useState<ReadonlySet<UniqueModelId>>(emptyModelIdSet);

  const removeModel = useCallback(
    async (model: Model) => {
      if (removingIds.has(model.id)) {
        return;
      }

      setRemovingIds((current) => new Set(current).add(model.id));
      try {
        await deleteModel({ params: { uniqueModelId: model.id } });
      } catch {
        alert.show({ title: t('settings.provider.models.removeFailed') });
      } finally {
        setRemovingIds((current) => {
          const next = new Set(current);
          next.delete(model.id);
          return next;
        });
      }
    },
    [alert, deleteModel, removingIds, t],
  );

  return {
    isDefaultModel: useCallback((model: Model) => model.id === defaultModelId, [defaultModelId]),
    removeModel,
    removingIds,
  };
}
