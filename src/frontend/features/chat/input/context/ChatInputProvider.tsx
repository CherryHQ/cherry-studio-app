import {
  createContext,
  type PropsWithChildren,
  type RefObject,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type TextInput } from 'react-native';

import {
  type ChatInputAction,
  type ChatInputActionId,
  getChatInputAction,
  toggleChatInputAction,
} from '../utils/chatInputActions';
import {
  appendChatInputAttachments,
  type ChatInputAttachmentDraft,
  removeChatInputAttachment,
} from '../utils/chatInputAttachments';
import {
  CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  type ChatInputReasoningEffort,
} from '../utils/chatInputReasoning';

type ChatInputStateContextValue = {
  attachments: readonly ChatInputAttachmentDraft[];
  draft: string;
  isReasoningEffortSelected: boolean;
  reasoningEffort: ChatInputReasoningEffort;
  selectedTool?: ChatInputAction;
  selectedToolId: ChatInputActionId | null;
};

type ChatInputActionsContextValue = {
  addAttachments: (attachments: ChatInputAttachmentDraft[]) => void;
  clearAttachments: () => void;
  clearReasoningEffort: () => void;
  clearSelectedTool: () => void;
  removeAttachment: (attachmentId: string) => void;
  selectAction: (actionId: ChatInputActionId) => void;
  selectReasoningEffort: (reasoningEffort: ChatInputReasoningEffort) => void;
  setSelectedTool: (actionId: ChatInputActionId | null) => void;
  setAttachments: (attachments: ChatInputAttachmentDraft[]) => void;
  setDraft: (draft: string) => void;
  syncReasoningEffort: (reasoningEffort: ChatInputReasoningEffort) => void;
};

type ChatInputMetaContextValue = {
  inputRef: RefObject<TextInput | null>;
};

const ChatInputStateContext = createContext<ChatInputStateContextValue | null>(null);
const ChatInputActionsContext = createContext<ChatInputActionsContextValue | null>(null);
const ChatInputMetaContext = createContext<ChatInputMetaContextValue | null>(null);

type ChatInputProviderProps = PropsWithChildren<{
  initialAttachments?: readonly ChatInputAttachmentDraft[];
  initialDraft?: string;
}>;

export function ChatInputProvider({
  children,
  initialAttachments = [],
  initialDraft = '',
}: ChatInputProviderProps) {
  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [isReasoningEffortSelected, setIsReasoningEffortSelected] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ChatInputReasoningEffort>(
    CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  );
  const [attachments, setAttachments] = useState<ChatInputAttachmentDraft[]>(() => [
    ...initialAttachments,
  ]);
  const [selectedToolId, setSelectedToolId] = useState<ChatInputActionId | null>(null);
  const addAttachments = useCallback((nextAttachments: ChatInputAttachmentDraft[]) => {
    setAttachments((current) => appendChatInputAttachments(current, nextAttachments));
  }, []);
  const selectedTool = useMemo(() => getChatInputAction(selectedToolId), [selectedToolId]);

  const selectAction = useCallback((actionId: ChatInputActionId) => {
    setSelectedToolId((current) => toggleChatInputAction(current, actionId));
  }, []);

  const selectReasoningEffort = useCallback((nextReasoningEffort: ChatInputReasoningEffort) => {
    setReasoningEffort(nextReasoningEffort);
    setIsReasoningEffortSelected(true);
  }, []);

  const clearReasoningEffort = useCallback(() => {
    setIsReasoningEffortSelected(false);
    setReasoningEffort(CHAT_INPUT_DEFAULT_REASONING_EFFORT);
  }, []);

  const syncReasoningEffort = useCallback((nextReasoningEffort: ChatInputReasoningEffort) => {
    setReasoningEffort(nextReasoningEffort);
  }, []);

  const clearSelectedTool = useCallback(() => {
    setSelectedToolId(null);
  }, []);

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((current) => removeChatInputAttachment(current, attachmentId));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const stateValue = useMemo(
    () => ({
      attachments,
      draft,
      isReasoningEffortSelected,
      reasoningEffort,
      selectedTool,
      selectedToolId,
    }),
    [attachments, draft, isReasoningEffortSelected, reasoningEffort, selectedTool, selectedToolId],
  );

  const actionsValue = useMemo(
    () => ({
      addAttachments,
      clearAttachments,
      clearReasoningEffort,
      clearSelectedTool,
      removeAttachment,
      selectAction,
      selectReasoningEffort,
      setSelectedTool: setSelectedToolId,
      setAttachments,
      setDraft,
      syncReasoningEffort,
    }),
    [
      addAttachments,
      clearAttachments,
      clearReasoningEffort,
      clearSelectedTool,
      removeAttachment,
      selectAction,
      selectReasoningEffort,
      syncReasoningEffort,
    ],
  );

  const metaValue = useMemo(
    () => ({
      inputRef,
    }),
    [],
  );

  return (
    <ChatInputStateContext value={stateValue}>
      <ChatInputActionsContext value={actionsValue}>
        <ChatInputMetaContext value={metaValue}>{children}</ChatInputMetaContext>
      </ChatInputActionsContext>
    </ChatInputStateContext>
  );
}

export function useChatInputState() {
  const context = use(ChatInputStateContext);

  if (!context) {
    throw new Error('useChatInputState must be used within ChatInputProvider');
  }

  return context;
}

export function useChatInputActions() {
  const context = use(ChatInputActionsContext);

  if (!context) {
    throw new Error('useChatInputActions must be used within ChatInputProvider');
  }

  return context;
}

export function useChatInputMeta() {
  const context = use(ChatInputMetaContext);

  if (!context) {
    throw new Error('useChatInputMeta must be used within ChatInputProvider');
  }

  return context;
}
