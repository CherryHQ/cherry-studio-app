import { useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo } from 'react-native';

import { useMutation } from '@/frontend/data';
import type { Model } from '@/shared/data/types/model';
import { isImageGenerationModel, isTextGenerationModel } from '@/shared/utils/modelPurpose';

import {
  planProviderModelReorder,
  type ProviderModelOrderGroup,
} from '../utils/providerModelOrder';
import { refreshProviderModelQueries } from '../utils/refreshProviderModelQueries';

type Draft = { ids: readonly string[]; serverKey: string };

export function useProviderModelOrder({
  models,
  providerId,
}: {
  models: readonly Model[];
  providerId: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { trigger } = useMutation('PATCH', '/models/order:batch');
  const [draft, setDraft] = useState<Draft>();
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const groups = new Map<string, ProviderModelOrderGroup | undefined>(
    models.map((model) => [
      model.id,
      isTextGenerationModel(model)
        ? 'chat'
        : isImageGenerationModel(model)
          ? 'painting'
          : undefined,
    ]),
  );
  const serverIds = models.map(({ id }) => id);
  const serverKey = JSON.stringify([providerId, models.map(({ id }) => [id, groups.get(id)])]);
  const observed = useRef({ serverKey, serverIds, groups });
  useLayoutEffect(() => {
    observed.current = { serverKey, serverIds, groups };
  });
  // Reconcile synchronously with query input so no event can submit stale inventory. Metadata-only
  // updates leave the session intact. Hidden purposes remain in the draft but cannot be moved.
  let current = draft;
  if (draft && draft.serverKey !== serverKey && !isSaving) {
    const surviving = draft.ids.filter((id) => groups.has(id));
    const known = new Set(surviving);
    current = { ids: [...surviving, ...serverIds.filter((id) => !known.has(id))], serverKey };
    setDraft(current);
  }
  const draftIds = current?.ids ?? serverIds;
  const groupIds = (id: string) =>
    groups.get(id) ? draftIds.filter((other) => groups.get(other) === groups.get(id)) : [];
  const canMoveUp = (id: string) => groupIds(id).indexOf(id) > 0;
  const canMoveDown = (id: string) => {
    const ids = groupIds(id);
    const index = ids.indexOf(id);
    return index >= 0 && index < ids.length - 1;
  };
  const canReorder = (['chat', 'painting'] as const).some(
    (group) => models.filter((model) => groups.get(model.id) === group).length > 1,
  );
  const positionOf = (id: string) => {
    const ids = groupIds(id);
    return { position: ids.indexOf(id) + 1, total: ids.length };
  };
  function moveModel(id: string, target: { before?: string; after?: string }) {
    if (!current || saving.current) return;
    const anchor = target.before ?? target.after;
    if (!anchor || anchor === id || !groups.get(id) || groups.get(anchor) !== groups.get(id))
      return;
    const ids = groupIds(id).filter((other) => other !== id);
    const anchorIndex = ids.indexOf(anchor);
    if (anchorIndex < 0) return;
    ids.splice(anchorIndex + (target.before ? 0 : 1), 0, id);
    // Replace only this group's slots; interleaved and omitted groups stay in canonical state.
    let index = 0;
    const next = draftIds.map((other) =>
      groups.get(other) === groups.get(id) ? ids[index++]! : other,
    );
    if (next.every((other, index) => other === draftIds[index])) return;
    setDraft({ ids: next, serverKey });
    AccessibilityInfo.announceForAccessibility(
      t('settings.provider.models.reorder.moved', {
        model: models.find((model) => model.id === id)?.name,
        position: ids.indexOf(id) + 1,
        total: ids.length,
      }),
    );
  }
  const cancel = useCallback(() => {
    if (!saving.current) setDraft(undefined);
  }, []);
  async function commit(): Promise<boolean> {
    if (saving.current) return false;
    if (!current) return true;
    // Only reorderBatch rewrites existing order keys, transactionally in one local database/stack.
    // Relative anchors compose with observed changes, so there is no revision token. A retained
    // callback must still refuse a batch built against an older query snapshot.
    const latest = observed.current;
    if (current.serverKey !== latest.serverKey) {
      const surviving = current.ids.filter((id) => latest.groups.has(id));
      const known = new Set(surviving);
      setDraft({
        ids: [...surviving, ...latest.serverIds.filter((id) => !known.has(id))],
        serverKey: latest.serverKey,
      });
      return false;
    }
    const visible = (ids: readonly string[]) => ids.filter((id) => groups.get(id));
    const moves = planProviderModelReorder({
      draftIds: visible(draftIds),
      groupOf: (id) => groups.get(id) as ProviderModelOrderGroup,
      originalIds: visible(serverIds),
    });
    if (moves.length === 0) {
      cancel();
      return true;
    }
    saving.current = true;
    setIsSaving(true);
    toast.show({ label: t('settings.provider.models.reorder.saving'), variant: 'default' });
    try {
      await trigger({ body: { moves } });
    } catch {
      toast.show({ label: t('settings.provider.models.reorder.failed'), variant: 'danger' });
      saving.current = false;
      setIsSaving(false);
      return false;
    }
    // A refresh failure after a committed write must never leave a retryable mutation draft.
    try {
      await refreshProviderModelQueries(queryClient, providerId, {
        refreshAgents: false,
        throwOnError: true,
      });
    } catch {
      toast.show({ label: t('settings.provider.models.reorder.refreshFailed'), variant: 'danger' });
    } finally {
      setDraft(undefined);
      saving.current = false;
      setIsSaving(false);
    }
    return true;
  }
  return {
    canReorder,
    positionOf,
    isReordering: Boolean(current),
    draftIds,
    isSaving,
    start: () => {
      if (!saving.current && canReorder) setDraft({ ids: serverIds, serverKey });
    },
    cancel,
    moveModel,
    moveUp: (id: string) => {
      const previous = groupIds(id)[groupIds(id).indexOf(id) - 1];
      if (previous) moveModel(id, { before: previous });
    },
    moveDown: (id: string) => {
      const next = groupIds(id)[groupIds(id).indexOf(id) + 1];
      if (next) moveModel(id, { after: next });
    },
    canMoveUp,
    canMoveDown,
    commit,
  };
}
