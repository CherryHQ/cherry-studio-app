import { useCallback, useMemo, useState } from 'react';

import type { Model, UniqueModelId } from '@/shared/data/types/model';

import type { ProviderModelPullPreview } from '../utils/providerModelPullPreview';

export type ProviderModelPullApplyChange = (change: {
  toAdd?: Model[];
  toRemove?: UniqueModelId[];
}) => Promise<boolean>;

/**
 * What a pull will apply once it is confirmed.
 *
 * Nothing is written before then. Desktop's dialog commits every tap on the
 * spot, but a pull proposes both halves of a reconcile at once — models to add
 * and models to drop — and a tap that deletes on landing is a poor thing to be
 * one row off on. Confirming sends both halves as one reconcile.
 */
export function useProviderModelPullSelection({
  applyModelChange,
  preview,
}: {
  applyModelChange: ProviderModelPullApplyChange;
  preview: ProviderModelPullPreview;
}) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<UniqueModelId>>(() =>
    getDefaultSelection(preview),
  );
  const [isApplying, setIsApplying] = useState(false);
  const previewKey = useMemo(() => getPreviewKey(preview), [preview]);
  // A fresh pull invalidates a selection made against the previous one. Reset
  // during render rather than in an effect so no frame shows the stale ticks.
  const [lastPreviewKey, setLastPreviewKey] = useState(previewKey);

  if (lastPreviewKey !== previewKey) {
    setLastPreviewKey(previewKey);
    setSelectedIds(getDefaultSelection(preview));
  }

  const applySelection = useCallback(async () => {
    const toAdd = preview.added.filter((model) => selectedIds.has(model.id));
    const toRemove = preview.missing
      .filter((model) => selectedIds.has(model.id))
      .map((model) => model.id);

    if (toAdd.length === 0 && toRemove.length === 0) {
      return false;
    }

    setIsApplying(true);
    const didApply = await applyModelChange({ toAdd, toRemove });
    setIsApplying(false);

    return didApply;
  }, [applyModelChange, preview, selectedIds]);

  return {
    applySelection,
    isApplying,
    selectedIds,
    // Scoped to the ids it is given rather than to everything, so selecting all
    // of a section — or of what a search left on screen — leaves the rest of
    // the selection alone.
    toggleAll: useCallback((ids: readonly UniqueModelId[]) => {
      setSelectedIds((current) => {
        const isEverythingSelected = ids.length > 0 && ids.every((id) => current.has(id));
        const next = new Set(current);

        for (const id of ids) {
          if (isEverythingSelected) {
            next.delete(id);
          } else {
            next.add(id);
          }
        }

        return next;
      });
    }, []),
    toggleModel: useCallback((id: UniqueModelId) => {
      setSelectedIds((current) => {
        const next = new Set(current);

        if (!next.delete(id)) {
          next.add(id);
        }

        return next;
      });
    }, []),
  };
}

/**
 * Every model the provider has gained, and none of the ones it has dropped.
 *
 * Taking the whole catalogue is what a pull is usually for, so ticking the new
 * models one by one is work the screen can do for the user. The other half is
 * left alone: dropping a model the user has been chatting with is not a thing
 * to arm on their behalf, and an unread confirmation would do exactly that.
 */
function getDefaultSelection(preview: ProviderModelPullPreview): ReadonlySet<UniqueModelId> {
  return new Set(preview.added.map((model) => model.id));
}

function getPreviewKey(preview: ProviderModelPullPreview): string {
  return [
    ...preview.added.map((model) => `added:${model.id}`),
    ...preview.missing.map((model) => `missing:${model.id}`),
  ].join('|');
}
