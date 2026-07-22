import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { MessageScope } from './scope';
import { areAllSelected, toggleSelection } from './selection';

// A tab body describes how the shared selection toolbar should act on its own
// data: which ids "select all" covers, how to delete the selected ones, and the
// delete-dialog copy. Each body registers this while it is mounted so the shell's
// generic toolbar stays free of any topic/painting specifics.
export type SelectionSource = {
  copy: { deleteFailed: string; deleteMessage: string; deleteTitle: string };
  deleteSelected: (ids: readonly string[]) => Promise<void>;
  getAllIds: () => readonly string[];
};

type MessageSelectionState = {
  isEditing: boolean;
  selectedIds: ReadonlySet<string>;
};

type MessageSelectionActions = {
  enterEditing: () => void;
  exitEditing: () => void;
  toggleAll: (allIds: readonly string[]) => void;
  toggleId: (id: string) => void;
};

type MessageSelectionSources = {
  registerSource: (scope: MessageScope, source: SelectionSource | undefined) => void;
  sources: Partial<Record<MessageScope, SelectionSource>>;
};

const MessageSelectionStateContext = createContext<MessageSelectionState | null>(null);
const MessageSelectionActionsContext = createContext<MessageSelectionActions | null>(null);
const MessageSelectionSourcesContext = createContext<MessageSelectionSources | null>(null);

type MessageSelectionProviderProps = PropsWithChildren<{
  onEditingChange?: (isEditing: boolean) => void;
}>;

export function MessageSelectionProvider({
  children,
  onEditingChange,
}: MessageSelectionProviderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [sources, setSources] = useState<Partial<Record<MessageScope, SelectionSource>>>({});

  const enterEditing = useCallback(() => {
    setIsEditing(true);
    onEditingChange?.(true);
  }, [onEditingChange]);

  const exitEditing = useCallback(() => {
    setIsEditing(false);
    setSelectedIds(new Set());
    onEditingChange?.(false);
  }, [onEditingChange]);

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

  const registerSource = useCallback((scope: MessageScope, source: SelectionSource | undefined) => {
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

  const stateValue = useMemo(() => ({ isEditing, selectedIds }), [isEditing, selectedIds]);
  const actionsValue = useMemo(
    () => ({ enterEditing, exitEditing, toggleAll, toggleId }),
    [enterEditing, exitEditing, toggleAll, toggleId],
  );
  const sourcesValue = useMemo(() => ({ registerSource, sources }), [registerSource, sources]);

  return (
    <MessageSelectionActionsContext value={actionsValue}>
      <MessageSelectionStateContext value={stateValue}>
        <MessageSelectionSourcesContext value={sourcesValue}>
          {children}
        </MessageSelectionSourcesContext>
      </MessageSelectionStateContext>
    </MessageSelectionActionsContext>
  );
}

export function useMessageSelectionState() {
  const context = use(MessageSelectionStateContext);

  if (!context) {
    throw new Error('useMessageSelectionState must be used within MessageSelectionProvider');
  }

  return context;
}

export function useMessageSelectionActions() {
  const context = use(MessageSelectionActionsContext);

  if (!context) {
    throw new Error('useMessageSelectionActions must be used within MessageSelectionProvider');
  }

  return context;
}

function useMessageSelectionSources() {
  const context = use(MessageSelectionSourcesContext);

  if (!context) {
    throw new Error('useMessageSelectionSources must be used within MessageSelectionProvider');
  }

  return context;
}

// A tab body calls this while mounted to expose its selection behavior to the
// shell. The source is keyed by scope so switching tabs picks the active body's.
export function useRegisterSelectionSource(scope: MessageScope, source: SelectionSource) {
  const { registerSource } = useMessageSelectionSources();

  useEffect(() => {
    registerSource(scope, source);
    return () => registerSource(scope, undefined);
  }, [registerSource, scope, source]);
}

export function useMessageSelectionSource(scope: MessageScope): SelectionSource | undefined {
  const { sources } = useMessageSelectionSources();
  return sources[scope];
}
