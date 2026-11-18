import { useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo } from 'react-native';

import { queryKeys, useApiClient, useMutation } from '@/frontend/data';
import type { Model } from '@/shared/data/types/model';
import { isImageGenerationModel, isTextGenerationModel } from '@/shared/utils/modelPurpose';

import {
  planProviderModelReorder,
  type ProviderModelOrderGroup,
} from '../utils/providerModelOrder';
import {
  refreshProviderModelQueries,
  waitForProviderModelOperation,
} from '../utils/refreshProviderModelQueries';

type Draft = { ids: readonly string[]; serverKey: string };

function orderSnapshot(models: readonly Model[], providerId: string) {
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
  return {
    groups,
    serverIds: models.map(({ id }) => id),
    serverKey: JSON.stringify([providerId, models.map(({ id }) => [id, groups.get(id)])]),
  };
}

function rebaseDraft(draft: Draft, snapshot: ReturnType<typeof orderSnapshot>): Draft {
  const surviving = draft.ids.filter((id) => snapshot.groups.has(id));
  const known = new Set(surviving);
  return {
    ids: [...surviving, ...snapshot.serverIds.filter((id) => !known.has(id))],
    serverKey: snapshot.serverKey,
  };
}

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
  const api = useApiClient();
  const inventory = orderSnapshot(models, providerId);
  const { groups, serverIds, serverKey } = inventory;
  // Reconcile changed query input synchronously. A commit-time read may arrive before its
  // rendered props; do not rebase that fresh snapshot back onto unchanged, older input.
  const [observedKey, setObservedKey] = useState(serverKey);
  let current = draft;
  if (observedKey !== serverKey && !isSaving) {
    setObservedKey(serverKey);
    if (draft && draft.serverKey !== serverKey) {
      current = rebaseDraft(draft, inventory);
      setDraft(current);
    }
  }
  const latest = useRef({
    draft: current,
    inventory,
    providerId,
    api,
    queryClient,
    trigger,
    t,
    toast,
  });
  useLayoutEffect(() => {
    latest.current = { draft: current, inventory, providerId, api, queryClient, trigger, t, toast };
  });
  const updateDraft = useCallback((next: Draft | undefined) => {
    latest.current.draft = next;
    setDraft(next);
  }, []);
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
    const draft = latest.current.draft;
    if (!draft || saving.current) return false;
    const draftIds = draft.ids;
    const anchor = target.before ?? target.after;
    if (!anchor || anchor === id || !groups.get(id) || groups.get(anchor) !== groups.get(id))
      return false;
    const ids = draftIds.filter((other) => other !== id && groups.get(other) === groups.get(id));
    const anchorIndex = ids.indexOf(anchor);
    if (anchorIndex < 0) return false;
    ids.splice(anchorIndex + (target.before ? 0 : 1), 0, id);
    // Replace only this group's slots; interleaved and omitted groups stay in canonical state.
    let index = 0;
    const next = draftIds.map((other) =>
      groups.get(other) === groups.get(id) ? ids[index++]! : other,
    );
    if (next.every((other, index) => other === draftIds[index])) return false;
    updateDraft({ ids: next, serverKey: draft.serverKey });
    AccessibilityInfo.announceForAccessibility(
      t('settings.provider.models.reorder.moved', {
        model: models.find((model) => model.id === id)?.name,
        position: ids.indexOf(id) + 1,
        total: ids.length,
      }),
    );
    return true;
  }
  const cancel = useCallback(() => {
    if (!saving.current) updateDraft(undefined);
  }, [updateDraft]);
  const commit = useCallback(async (): Promise<boolean> => {
    if (saving.current) return false;
    const { draft, inventory, providerId, api, queryClient, trigger, t, toast } = latest.current;
    if (!draft) return true;
    // This command is the only writer of existing order keys; reconcile only inserts. The app
    // has one local database and one reorder surface, and this lock prevents overlapping commits.
    // An authoritative read plus relative anchors is sufficient: a revision token would invent
    // a rejection for a state this build cannot produce.
    saving.current = true;
    setIsSaving(true);
    try {
      try {
        // Joining an in-flight read is exactly the staleness this preflight must avoid.
        // A cache-managed failure could also replace the reorder screen with the list error.
        // A direct read plus setQueryData gives a snapshot, not a subscription.
        const models = await waitForProviderModelOperation(
          queryClient,
          providerId,
          api.get('/models', { query: { providerId } }),
        );
        queryClient.setQueryData(queryKeys.models.list({ providerId }), models);
        const baseline = orderSnapshot(models, providerId);
        latest.current.inventory = baseline;
        if (draft.serverKey !== baseline.serverKey || inventory.serverKey !== baseline.serverKey) {
          updateDraft(rebaseDraft(draft, baseline));
          return false;
        }
        const visible = (ids: readonly string[]) => ids.filter((id) => baseline.groups.get(id));
        const moves = planProviderModelReorder({
          draftIds: visible(draft.ids),
          groupOf: (id) => baseline.groups.get(id) as ProviderModelOrderGroup,
          originalIds: visible(baseline.serverIds),
        });
        if (moves.length === 0) {
          updateDraft(undefined);
          return true;
        }
        toast.show({ label: t('settings.provider.models.reorder.saving'), variant: 'default' });
        await trigger({ body: { moves } });
      } catch {
        toast.show({ label: t('settings.provider.models.reorder.failed'), variant: 'danger' });
        return false;
      }
      // A refresh failure after a committed write must never leave a retryable mutation draft.
      try {
        await refreshProviderModelQueries(queryClient, providerId, {
          refreshAgents: false,
          throwOnError: true,
          waitForSettled: true,
        });
      } catch {
        toast.show({
          label: t('settings.provider.models.reorder.refreshFailed'),
          variant: 'danger',
        });
      }
      updateDraft(undefined);
      return true;
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }, [updateDraft]);

  return {
    canReorder,
    positionOf,
    isReordering: Boolean(current),
    draftIds,
    isSaving,
    start: () => {
      if (!saving.current && canReorder) updateDraft({ ids: serverIds, serverKey });
    },
    cancel,
    moveModel,
    moveUp: (id: string) => {
      const previous = groupIds(id)[groupIds(id).indexOf(id) - 1];
      return previous ? moveModel(id, { before: previous }) : false;
    },
    moveDown: (id: string) => {
      const next = groupIds(id)[groupIds(id).indexOf(id) + 1];
      return next ? moveModel(id, { after: next }) : false;
    },
    canMoveUp,
    canMoveDown,
    commit,
  };
}
