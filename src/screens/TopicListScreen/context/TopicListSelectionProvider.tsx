import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { areAllSelected, toggleSelection } from '../utils/topicSelection';

type TopicListSelectionState = {
  isEditing: boolean;
  selectedIds: ReadonlySet<string>;
};

type TopicListSelectionActions = {
  enterEditing: () => void;
  exitEditing: () => void;
  toggleAll: (allIds: readonly string[]) => void;
  toggleId: (id: string) => void;
};

const TopicListSelectionStateContext = createContext<TopicListSelectionState | null>(null);
const TopicListSelectionActionsContext = createContext<TopicListSelectionActions | null>(null);

type TopicListSelectionProviderProps = PropsWithChildren<{
  onEditingChange?: (isEditing: boolean) => void;
}>;

export function TopicListSelectionProvider({
  children,
  onEditingChange,
}: TopicListSelectionProviderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

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

  const stateValue = useMemo(() => ({ isEditing, selectedIds }), [isEditing, selectedIds]);
  const actionsValue = useMemo(
    () => ({ enterEditing, exitEditing, toggleAll, toggleId }),
    [enterEditing, exitEditing, toggleAll, toggleId],
  );

  return (
    <TopicListSelectionActionsContext value={actionsValue}>
      <TopicListSelectionStateContext value={stateValue}>{children}</TopicListSelectionStateContext>
    </TopicListSelectionActionsContext>
  );
}

export function useTopicListSelectionState() {
  const context = use(TopicListSelectionStateContext);

  if (!context) {
    throw new Error('useTopicListSelectionState must be used within TopicListSelectionProvider');
  }

  return context;
}

export function useTopicListSelectionActions() {
  const context = use(TopicListSelectionActionsContext);

  if (!context) {
    throw new Error('useTopicListSelectionActions must be used within TopicListSelectionProvider');
  }

  return context;
}
