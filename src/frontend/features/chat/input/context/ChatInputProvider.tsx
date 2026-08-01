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

type ChatInputStateContextValue = {
  attachments: readonly ChatInputAttachmentDraft[];
  draft: string;
  isActionSheetOpen: boolean;
  isComposerExpanded: boolean;
  isInputFocused: boolean;
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
  closeActionSheet: () => void;
  openActionSheet: () => void;
  removeAttachment: (attachmentId: string) => void;
  selectAction: (actionId: ChatInputActionId) => void;
  selectReasoningEffort: (reasoningEffort: ChatInputReasoningEffort) => void;
  setAttachments: (attachments: ChatInputAttachmentDraft[]) => void;
  setDraft: (draft: string) => void;
  setInputFocused: (isFocused: boolean) => void;
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
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
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
  const media = useChatInputPhotoPicker(isActionSheetOpen, addAttachments);
  const selectedTool = useMemo(() => getChatInputAction(selectedToolId), [selectedToolId]);
  // Collapse to a centered pill only when nothing requires the full surface.
  // Reasoning effort no longer expands the surface: its control lives in the
  // model picker sheet and the toolbar shows no reasoning tag.
  const isComposerExpanded =
    isInputFocused || draft.trim() !== '' || attachments.length > 0 || Boolean(selectedTool);

  const openActionSheet = useCallback(() => {
    // Don't blur/dismiss the keyboard: let iOS keep the input as first responder
    // and auto-restore it when the sheet dismisses (immediate, no manual refocus).
    setIsActionSheetOpen(true);
  }, []);

  const closeActionSheet = useCallback(() => {
    setIsActionSheetOpen(false);
  }, []);

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
      isActionSheetOpen,
      isComposerExpanded,
      isInputFocused,
      isReasoningEffortSelected,
      reasoningEffort,
      selectedTool,
      selectedToolId,
    }),
    [
      attachments,
      draft,
      isActionSheetOpen,
      isComposerExpanded,
      isInputFocused,
      isReasoningEffortSelected,
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
      closeActionSheet,
      openActionSheet,
      removeAttachment,
      selectAction,
      selectReasoningEffort,
      setAttachments,
      setDraft,
      setInputFocused: setIsInputFocused,
    }),
    [
      addAttachments,
      clearAttachments,
      clearReasoningEffort,
      clearSelectedTool,
      closeActionSheet,
      openActionSheet,
      removeAttachment,
      selectAction,
      selectReasoningEffort,
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
