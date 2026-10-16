import { useAlert, useToast } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { useDrawerStatus } from 'expo-router/drawer';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler } from 'react-native';
import {
  cancelAnimation,
  ReduceMotion,
  type SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type {
  ConversationRef,
  ConversationSource,
  ConversationSummary,
} from '@/frontend/appShell/conversation';
import { areAllSelected, toggleSelection } from '@/frontend/components/Selection';

type SelectionEntry = { key: string; source: ConversationSource; ref: ConversationRef };
type SelectionList = { ids: readonly string[]; refresh: () => Promise<unknown> };
type SelectionSnapshot = {
  isSelecting: boolean;
  isDeleting: boolean;
  selectedIds: ReadonlySet<string>;
  deletedIds: ReadonlySet<string>;
  lists: ReadonlyMap<string, SelectionList>;
};
type SelectionStore = ReturnType<typeof createSelectionStore>;
type SidebarSelection = SelectionStore & {
  progress: SharedValue<number>;
  requestDelete: () => void;
};

const SidebarSelectionContext = createContext<SidebarSelection | null>(null);

export function SidebarSelectionProvider({
  children,
  scope,
}: PropsWithChildren<{ scope: string }>) {
  const [store] = useState(createSelectionStore);
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const open = useDrawerStatus() === 'open';
  const isSelecting = useSelectionSnapshot(store, (state) => state.isSelecting);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(
      withTiming(isSelecting ? 1 : 0, {
        duration: duration.fast,
        easing: easing.settle,
        reduceMotion: ReduceMotion.System,
      }),
    );
    return () => cancelAnimation(progress);
  }, [isSelecting, progress]);

  // Drawer dismissal and a different catalog end the selection, not admitted deletions.
  useEffect(() => {
    store.exit();
  }, [scope, store]);
  useEffect(() => {
    if (!open) store.exit();
  }, [open, store]);
  useEffect(() => {
    if (!open || !isSelecting) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      store.exit();
      return true;
    });
    return () => subscription.remove();
  }, [isSelecting, open, store]);

  const requestDelete = useCallback(() => {
    const state = store.getSnapshot();
    const entries = store.selectedEntries();
    if (!state.isSelecting || state.isDeleting || !entries.length) return;
    const selection = store.generation();
    alert.confirm({
      title: t('session.selection.deleteTitle', { count: entries.length }),
      description: t('session.selection.deleteMessage'),
      confirmLabel: t('common.delete'),
      role: 'destructive',
      onConfirm: () => {
        if (selection !== store.generation() || store.getSnapshot().isDeleting) return;
        store.beginDeletion();
        void (async () => {
          const failed = new Set<string>();
          // Local session deletion cancels active turns and writes SQLite; keep admissions serial.
          for (const entry of entries) {
            try {
              const remove = entry.source.catalog.previewSession?.(entry.ref).remove;
              if (
                entry.source.state.getSnapshot().availability.state !== 'enabled' ||
                remove?.availability.state !== 'enabled'
              ) {
                failed.add(entry.key);
                continue;
              }
              const result = await remove.execute(undefined);
              if (
                result.state === 'applied' ||
                (result.state === 'rejected' && result.failure.code === 'not-found')
              ) {
                store.confirmDeleted(entry.key);
              } else {
                failed.add(entry.key);
              }
            } catch {
              failed.add(entry.key);
            }
          }
          await Promise.allSettled(
            [...store.getSnapshot().lists.values()].map((list) => list.refresh()),
          );
          store.finishDeletion(selection, failed);
          toast.show(
            failed.size
              ? { label: t('session.selection.deleteFailed'), variant: 'danger' }
              : {
                  label: t('session.selection.deleted', { count: entries.length }),
                  variant: 'success',
                },
          );
        })();
      },
    });
  }, [alert, store, t, toast]);

  const value = useMemo(
    () => ({ ...store, progress, requestDelete }),
    [store, progress, requestDelete],
  );
  return <SidebarSelectionContext value={value}>{children}</SidebarSelectionContext>;
}

export function useSidebarSelection() {
  const selection = use(SidebarSelectionContext);
  if (!selection) throw new Error('Sidebar selection requires SidebarSelectionProvider');
  return selection;
}

/** Primitive subscriptions keep a checkmark update local to its row and the footer count. */
export function useSidebarSelectionSnapshot<T extends boolean | number>(
  select: (state: SelectionSnapshot) => T,
) {
  return useSelectionSnapshot(useSidebarSelection(), select);
}

function useSelectionSnapshot<T extends boolean | number>(
  store: SelectionStore,
  select: (state: SelectionSnapshot) => T,
) {
  const getSnapshot = useCallback(() => select(store.getSnapshot()), [select, store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

function createSelectionStore() {
  let state: SelectionSnapshot = {
    isSelecting: false,
    isDeleting: false,
    selectedIds: new Set(),
    deletedIds: new Set(),
    lists: new Map(),
  };
  let generation = 0;
  const entries = new Map<string, SelectionEntry>();
  const listeners = new Set<() => void>();
  const update = (next: SelectionSnapshot) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const shownIds = () =>
    [...new Set([...state.lists.values()].flatMap((list) => list.ids))].filter(
      (id) => !state.deletedIds.has(id),
    );

  return {
    getSnapshot: () => state,
    generation: () => generation,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    shownIds,
    allSelected: () => areAllSelected(state.selectedIds, shownIds()),
    registerList: (
      key: string,
      source: ConversationSource,
      sessions: readonly ConversationSummary[],
      refresh: SelectionList['refresh'],
    ) => {
      const ids = sessions.flatMap((session) => {
        // Desktop catalogs currently expose no delete action. Never open transcripts to obtain one.
        if (
          source.ref.kind !== 'local' ||
          source.state.getSnapshot().availability.state !== 'enabled' ||
          source.catalog.previewSession?.(session.ref).remove?.availability.state !== 'enabled'
        )
          return [];
        const selectionKey = JSON.stringify([source.scope, session.ref.sessionId]);
        entries.set(selectionKey, { key: selectionKey, source, ref: session.ref });
        return [selectionKey];
      });
      const list = { ids, refresh };
      update({ ...state, lists: new Map(state.lists).set(key, list) });
      return () => {
        if (state.lists.get(key) !== list) return;
        const lists = new Map(state.lists);
        lists.delete(key);
        update({ ...state, lists });
      };
    },
    enter: (id?: string) => {
      if (state.isDeleting || (id && !entries.has(id))) return;
      generation++;
      update({ ...state, isSelecting: true, selectedIds: new Set(id ? [id] : []) });
    },
    exit: () => {
      generation++;
      if (state.isSelecting || state.selectedIds.size)
        update({ ...state, isSelecting: false, selectedIds: new Set() });
    },
    toggle: (id: string) => {
      if (!state.isSelecting || state.isDeleting || state.deletedIds.has(id) || !entries.has(id))
        return;
      update({ ...state, selectedIds: toggleSelection(state.selectedIds, id) });
    },
    toggleAll: () => {
      if (!state.isSelecting || state.isDeleting) return;
      const ids = shownIds();
      const clear = areAllSelected(state.selectedIds, ids);
      const selectedIds = new Set(state.selectedIds);
      for (const id of ids) {
        if (clear) selectedIds.delete(id);
        else selectedIds.add(id);
      }
      update({ ...state, selectedIds });
    },
    selectedEntries: () => [...state.selectedIds].flatMap((id) => entries.get(id) ?? []),
    beginDeletion: () => update({ ...state, isDeleting: true }),
    confirmDeleted: (id: string) => {
      const selectedIds = new Set(state.selectedIds);
      selectedIds.delete(id);
      update({ ...state, selectedIds, deletedIds: new Set(state.deletedIds).add(id) });
    },
    finishDeletion: (selection: number, failed: ReadonlySet<string>) => {
      update({
        ...state,
        isDeleting: false,
        ...(generation === selection ? { selectedIds: failed, isSelecting: failed.size > 0 } : {}),
      });
    },
  };
}
