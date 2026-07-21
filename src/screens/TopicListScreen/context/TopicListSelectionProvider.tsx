import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  areAllTopicsSelected,
  getAllTopicIds,
  toggleTopicSelection,
} from '../utils/topicSelection';
import { useTopicListTopics } from './TopicListProvider';

type TopicListSelectionState = {
  isEditing: boolean;
  selectedTopicIds: ReadonlySet<string>;
};

type TopicListSelectionActions = {
  enterEditing: () => void;
  exitEditing: () => void;
  toggleAllTopics: () => void;
  toggleTopic: (topicId: string) => void;
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
  const { topics } = useTopicListTopics();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTopicIds, setSelectedTopicIds] = useState<ReadonlySet<string>>(() => new Set());

  const enterEditing = useCallback(() => {
    setIsEditing(true);
    onEditingChange?.(true);
  }, [onEditingChange]);

  const exitEditing = useCallback(() => {
    setIsEditing(false);
    setSelectedTopicIds(new Set());
    onEditingChange?.(false);
  }, [onEditingChange]);

  useEffect(
    () => () => {
      onEditingChange?.(false);
    },
    [onEditingChange],
  );

  const toggleTopic = useCallback((topicId: string) => {
    setSelectedTopicIds((current) => toggleTopicSelection(current, topicId));
  }, []);

  const toggleAllTopics = useCallback(() => {
    setSelectedTopicIds((current) =>
      areAllTopicsSelected(current, topics) ? new Set() : getAllTopicIds(topics),
    );
  }, [topics]);

  const stateValue = useMemo(
    () => ({ isEditing, selectedTopicIds }),
    [isEditing, selectedTopicIds],
  );
  const actionsValue = useMemo(
    () => ({ enterEditing, exitEditing, toggleAllTopics, toggleTopic }),
    [enterEditing, exitEditing, toggleAllTopics, toggleTopic],
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
