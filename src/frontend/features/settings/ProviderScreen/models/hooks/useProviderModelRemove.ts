import { useAlert } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';
import type { Model } from '@/shared/data/types/model';

/**
 * Removing models from their provider. The list removes by selection rather
 * than row by row, so this takes a set and sends one request — `DELETE /models`
 * takes the ids as a query and the service deletes them in a single write.
 *
 * The chat default is the one model that cannot go: the service refuses it, and
 * `isDefaultModel` lets the list leave its row untickable rather than let the
 * delete fail halfway.
 */
export function useProviderModelRemove() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const removeModelsMutation = useMutation('DELETE', '/models', {
    refresh: ['/models'],
  });
  const deleteModels = removeModelsMutation.trigger;
  const [defaultModelId] = usePreference('chat.default_model_id');

  const removeModels = useCallback(
    async (models: Model[]) => {
      const ids = models.map((model) => model.id);

      if (ids.length === 0) {
        return;
      }

      try {
        await deleteModels({ query: { ids } });
      } catch {
        alert.show({ title: t('settings.provider.models.selection.removeFailed') });
      }
    },
    [alert, deleteModels, t],
  );

  return {
    isDefaultModel: useCallback((model: Model) => model.id === defaultModelId, [defaultModelId]),
    removeModels,
  };
}
