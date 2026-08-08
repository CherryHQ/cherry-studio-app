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

import { useChatInputPhotoPicker } from '../hooks/useChatInputPhotoPicker';
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

/**
 * Which face the ＋ menu is showing. It lives here rather than in the menu
 * because the photo picker's permissions and previews are gated on it, and that
 * hook is owned by this provider.
 */
export type ChatInputMenuLevel = 'camera' | 'photos' | 'root';

type ChatInputStateContextValue = {
  attachments: readonly ChatInputAttachmentDraft[];
  draft: string;
  isReasoningEffortSelected: boolean;
  menuLevel: ChatInputMenuLevel;
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
  setMenuLevel: (level: ChatInputMenuLevel) => void;
  syncReasoningEffort: (reasoningEffort: ChatInputReasoningEffort) => void;
};

type ChatInputMediaContextValue = ReturnType<typeof useChatInputPhotoPicker>;

type ChatInputMetaContextValue = {
  inputRef: RefObject<TextInput | null>;
};

const ChatInputStateContext = createContext<ChatInputStateContextValue | null>(null);
const ChatInputActionsContext = createContext<ChatInputActionsContextValue | null>(null);
const ChatInputMediaContext = createContext<ChatInputMediaContextValue | null>(null);
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
  const [menuLevel, setMenuLevel] = useState<ChatInputMenuLevel>('root');
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
  // Permissions and previews load only while the grid is actually on screen —
  // tighter than the old sheet, which loaded them the moment ＋ was tapped.
  const media = useChatInputPhotoPicker(menuLevel === 'photos', addAttachments);
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
      menuLevel,
      reasoningEffort,
      selectedTool,
      selectedToolId,
    }),
    [
      attachments,
      draft,
      isReasoningEffortSelected,
      menuLevel,
      reasoningEffort,
      selectedTool,
      selectedToolId,
    ],
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
      setMenuLevel,
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
        <ChatInputMediaContext value={media}>
          <ChatInputMetaContext value={metaValue}>{children}</ChatInputMetaContext>
        </ChatInputMediaContext>
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

export function useChatInputMedia() {
  const context = use(ChatInputMediaContext);

  if (!context) {
    throw new Error('useChatInputMedia must be used within ChatInputProvider');
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
