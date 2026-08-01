import { useCallback, useMemo, useState } from 'react';

import type { Model, UniqueModelId } from '@cherrystudio/shared/data/types/model';

import type {
  ProviderModelPullPreview,
  ProviderModelPullSectionKey,
} from '../utils/providerModelPullPreview';

export type ProviderModelPullApplyChange = (change: {
  toAdd?: Model[];
  toRemove?: UniqueModelId[];
}) => Promise<boolean>;

const emptyModelIdSet: ReadonlySet<UniqueModelId> = new Set();

/**
 * Commits each tap straight to the database, the way desktop's dialog does, and
 * tracks which rows have landed so the glyph can flip.
 *
 * `appliedIds` is optimistic: the row flips first and the write is awaited after,
 * rolling back on failure. Desktop can afford to wait for a round trip plus a
 * revalidation because it is talking to a local server; here a tap has to feel
 * immediate. `pendingIds` keeps a second tap from racing the first.
 */
export function useProviderModelPullApply({
  applyModelChange,
  preview,
}: {
  applyModelChange: ProviderModelPullApplyChange;
  preview: ProviderModelPullPreview;
}) {
  const [appliedIds, setAppliedIds] = useState<ReadonlySet<UniqueModelId>>(emptyModelIdSet);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<UniqueModelId>>(emptyModelIdSet);
  const previewKey = useMemo(() => getPreviewKey(preview), [preview]);
  // A fresh pull invalidates everything recorded against the previous one. Reset
  // during render rather than in an effect so no frame shows the stale glyphs.
  const [lastPreviewKey, setLastPreviewKey] = useState(previewKey);

  if (lastPreviewKey !== previewKey) {
    setLastPreviewKey(previewKey);
    setAppliedIds(emptyModelIdSet);
    setPendingIds(emptyModelIdSet);
  }

  const commit = useCallback(
    async (models: readonly Model[], section: ProviderModelPullSectionKey, isApplied: boolean) => {
      const targets = models.filter((model) => !pendingIds.has(model.id));
      if (targets.length === 0) {
        return;
      }

      const targetIds = targets.map((model) => model.id);
      // An `added` row that has landed is undone by removing it again; a `missing`
      // row works the other way around.
      const shouldRemove = section === 'added' ? isApplied : !isApplied;

      setPendingIds((current) => withItems(current, targetIds));
      setAppliedIds((current) =>
        isApplied ? withoutItems(current, targetIds) : withItems(current, targetIds),
      );

      const didApply = await applyModelChange(
        shouldRemove ? { toRemove: targetIds } : { toAdd: targets },
      );

      setPendingIds((current) => withoutItems(current, targetIds));
      if (!didApply) {
        setAppliedIds((current) =>
          isApplied ? withItems(current, targetIds) : withoutItems(current, targetIds),
        );
      }
    },
    [applyModelChange, pendingIds],
  );

  const toggleModel = useCallback(
    (model: Model, section: ProviderModelPullSectionKey) => {
      void commit([model], section, appliedIds.has(model.id));
    },
    [appliedIds, commit],
  );
  const toggleSection = useCallback(
    (models: readonly Model[], section: ProviderModelPullSectionKey) => {
      // A section header undoes itself only once every row it covers has landed;
      // until then it acts on whatever is left over.
      const isEverythingApplied =
        models.length > 0 && models.every((model) => appliedIds.has(model.id));
      const targets = models.filter((model) => appliedIds.has(model.id) === isEverythingApplied);
      void commit(targets, section, isEverythingApplied);
    },
    [appliedIds, commit],
  );

  return { appliedIds, pendingIds, toggleModel, toggleSection };
}

function withItems<TItem>(items: ReadonlySet<TItem>, added: readonly TItem[]): ReadonlySet<TItem> {
  const next = new Set(items);
  for (const item of added) {
    next.add(item);
  }
  return next;
}

function withoutItems<TItem>(
  items: ReadonlySet<TItem>,
  removed: readonly TItem[],
): ReadonlySet<TItem> {
  const next = new Set(items);
  for (const item of removed) {
    next.delete(item);
  }
  return next;
}

function getPreviewKey(preview: ProviderModelPullPreview): string {
  return [
    ...preview.added.map((model) => `added:${model.id}`),
    ...preview.missing.map((model) => `missing:${model.id}`),
  ].join('|');
}
