import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { areAllSelected, toggleSelection } from './selection';

// A list body describes how the shared selection toolbar should act on its own
// data: which ids "select all" covers, how to delete the selected ones, and the
// delete-dialog copy. Each body registers this while it is mounted so the shell's
// generic toolbar stays free of any topic/painting specifics.
export type SelectionSource = {
  copy: { deleteFailed: string; deleteMessage: string; deleteTitle: string };
  deleteSelected: (ids: readonly string[]) => Promise<void>;
  getAllIds: () => readonly string[];
};

type SelectionState = {
  isDeletionPending: boolean;
  isEditing: boolean;
  pendingDeletionIds: PendingDeletionIdsByScope;
  selectedIds: ReadonlySet<string>;
};

type SelectionActions = {
  beginDeletion: (scope: string, ids: readonly string[]) => void;
  enterEditing: () => void;
  exitEditing: () => void;
  finishDeletion: (scope: string, ids: readonly string[]) => void;
  toggleAll: (allIds: readonly string[]) => void;
  toggleId: (id: string) => void;
};

type PendingDeletionIdsByScope = Record<string, ReadonlySet<string>>;

type RegisterSelectionSource = (scope: string, source: SelectionSource | undefined) => void;

const SelectionStateContext = createContext<SelectionState | null>(null);
const SelectionActionsContext = createContext<SelectionActions | null>(null);
const RegisterSourceContext = createContext<RegisterSelectionSource | null>(null);
const SelectionSourcesContext = createContext<Record<string, SelectionSource> | null>(null);

const emptyIdSet: ReadonlySet<string> = new Set();

type SelectionProviderProps = PropsWithChildren<{
  onEditingChange?: (isEditing: boolean) => void;
}>;

export function SelectionProvider({ children, onEditingChange }: SelectionProviderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingDeletionIds, setPendingDeletionIds] = useState<PendingDeletionIdsByScope>(
    () => ({}),
  );
  const [sources, setSources] = useState<Record<string, SelectionSource>>({});
  const isDeletionPending = Object.values(pendingDeletionIds).some((ids) => ids.size > 0);

  const enterEditing = useCallback(() => {
    if (isDeletionPending) {
      return;
    }

    setIsEditing(true);
    onEditingChange?.(true);
  }, [isDeletionPending, onEditingChange]);

  const exitEditing = useCallback(() => {
    setIsEditing(false);
    setSelectedIds(new Set());
    onEditingChange?.(false);
  }, [onEditingChange]);

  const beginDeletion = useCallback(
    (scope: string, ids: readonly string[]) => {
      if (ids.length === 0) {
        return;
      }

      setPendingDeletionIds((current) => {
        const nextScopeIds = new Set(current[scope] ?? emptyIdSet);
        const previousSize = nextScopeIds.size;

        for (const id of ids) {
          nextScopeIds.add(id);
        }

        return nextScopeIds.size === previousSize ? current : { ...current, [scope]: nextScopeIds };
      });
      setIsEditing(false);
      setSelectedIds(new Set());
      onEditingChange?.(false);
    },
    [onEditingChange],
  );

  const finishDeletion = useCallback((scope: string, ids: readonly string[]) => {
    setPendingDeletionIds((current) => {
      const nextScopeIds = new Set(current[scope] ?? emptyIdSet);
      let changed = false;

      for (const id of ids) {
        changed = nextScopeIds.delete(id) || changed;
      }

      return changed ? { ...current, [scope]: nextScopeIds } : current;
    });
  }, []);

  useEffect(
    () => () => {
      onEditingChange?.(false);
    },
    [onEditingChange],
  );

  const toggleId = useCallback((id: string) => {
    setSelectedIds((current) => toggleSelection(current, id));
  }, []);

  const toggleAll = useCallback((allIds: readonly string[]) => {
    setSelectedIds((current) => (areAllSelected(current, allIds) ? new Set() : new Set(allIds)));
  }, []);

  const registerSource = useCallback((scope: string, source: SelectionSource | undefined) => {
    setSources((current) => {
      if (current[scope] === source) {
        return current;
      }

      const next = { ...current };
      if (source) {
        next[scope] = source;
      } else {
        delete next[scope];
      }
      return next;
    });
  }, []);

  const stateValue = useMemo(
    () => ({ isDeletionPending, isEditing, pendingDeletionIds, selectedIds }),
    [isDeletionPending, isEditing, pendingDeletionIds, selectedIds],
  );
  const actionsValue = useMemo(
    () => ({ beginDeletion, enterEditing, exitEditing, finishDeletion, toggleAll, toggleId }),
    [beginDeletion, enterEditing, exitEditing, finishDeletion, toggleAll, toggleId],
  );

  return (
    <SelectionActionsContext value={actionsValue}>
      <SelectionStateContext value={stateValue}>
        <RegisterSourceContext value={registerSource}>
          <SelectionSourcesContext value={sources}>{children}</SelectionSourcesContext>
        </RegisterSourceContext>
      </SelectionStateContext>
    </SelectionActionsContext>
  );
}

export function useSelectionState() {
  const context = use(SelectionStateContext);

  if (!context) {
    throw new Error('useSelectionState must be used within SelectionProvider');
  }

  return context;
}

export function useSelectionActions() {
  const context = use(SelectionActionsContext);

  if (!context) {
    throw new Error('useSelectionActions must be used within SelectionProvider');
  }

  return context;
}

export function usePendingDeletionIds(scope: string): ReadonlySet<string> {
  return useSelectionState().pendingDeletionIds[scope] ?? emptyIdSet;
}

// `registerSource` lives in its own context with a stable reference, so a body
// registering its source never re-renders the body itself. If it did, an
// unstable source object would feed setState straight back into its own effect
// and loop forever ("Maximum update depth exceeded").
function useRegisterSource() {
  const context = use(RegisterSourceContext);

  if (!context) {
    throw new Error('useRegisterSource must be used within SelectionProvider');
  }

  return context;
}

// A list body calls this while mounted to expose its selection behavior to the
// shell. The source is keyed by scope so a shell hosting several bodies can
// address the active one.
export function useRegisterSelectionSource(scope: string, source: SelectionSource) {
  const registerSource = useRegisterSource();

  useEffect(() => {
    registerSource(scope, source);
    return () => registerSource(scope, undefined);
  }, [registerSource, scope, source]);
}

export function useSelectionSource(scope: string): SelectionSource | undefined {
  const context = use(SelectionSourcesContext);

  if (!context) {
    throw new Error('useSelectionSource must be used within SelectionProvider');
  }

  return context[scope];
}
