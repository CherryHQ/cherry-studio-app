import {
  createContext,
  type PropsWithChildren,
  type RefObject,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Keyboard, type TextInput } from 'react-native';
import { useChatInputPhotoPicker } from '@/screens/ChatScreen/input/hooks/useChatInputPhotoPicker';
import {
  type ChatInputAction,
  type ChatInputActionId,
  getChatInputAction,
  toggleChatInputAction,
} from '@/screens/ChatScreen/input/utils/chatInputActions';

type ChatInputSelectedAssetsState = {
  selectedPhotoCount: number;
  selectedPhotoOrder: ReadonlyMap<string, number>;
};

type ChatInputStateContextValue = {
  draft: string;
  isActionSheetOpen: boolean;
  isInputFocused: boolean;
  selectedAssets: ChatInputSelectedAssetsState;
  selectedTool?: ChatInputAction;
  selectedToolId: ChatInputActionId | null;
};

type ChatInputActionsContextValue = {
  clearSelectedTool: () => void;
  closeActionSheet: () => void;
  openActionSheet: () => void;
  selectAction: (actionId: ChatInputActionId) => void;
  setDraft: (draft: string) => void;
  setInputFocused: (isFocused: boolean) => void;
};

type ChatInputMediaContextValue = ReturnType<typeof useChatInputPhotoPicker>;

type ChatInputMetaContextValue = {
  inputRef: RefObject<TextInput | null>;
};

const chatInputFocusAfterActionDelay = 100;

const ChatInputStateContext = createContext<ChatInputStateContextValue | null>(null);
const ChatInputActionsContext = createContext<ChatInputActionsContextValue | null>(null);
const ChatInputMediaContext = createContext<ChatInputMediaContextValue | null>(null);
const ChatInputMetaContext = createContext<ChatInputMetaContextValue | null>(null);

export function ChatInputProvider({ children }: PropsWithChildren) {
  const inputRef = useRef<TextInput>(null);
  const focusAfterActionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldFocusAfterActionSheetCloseRef = useRef(false);
  const [draft, setDraft] = useState('');
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<ChatInputActionId | null>(null);
  const media = useChatInputPhotoPicker(isActionSheetOpen);
  const selectedTool = useMemo(() => getChatInputAction(selectedToolId), [selectedToolId]);

  useEffect(() => {
    return () => {
      if (focusAfterActionTimeoutRef.current) {
        clearTimeout(focusAfterActionTimeoutRef.current);
      }
    };
  }, []);

  const openActionSheet = useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    setIsInputFocused(false);
    setIsActionSheetOpen(true);
  }, []);

  const closeActionSheet = useCallback(() => {
    setIsActionSheetOpen(false);

    if (!shouldFocusAfterActionSheetCloseRef.current) {
      return;
    }

    shouldFocusAfterActionSheetCloseRef.current = false;

    if (focusAfterActionTimeoutRef.current) {
      clearTimeout(focusAfterActionTimeoutRef.current);
    }

    // Native sheet close callbacks fire before the dismissal animation has released focus.
    focusAfterActionTimeoutRef.current = setTimeout(() => {
      inputRef.current?.focus();
      focusAfterActionTimeoutRef.current = null;
    }, chatInputFocusAfterActionDelay);
  }, []);

  const selectAction = useCallback((actionId: ChatInputActionId) => {
    setSelectedToolId((currentActionId) => toggleChatInputAction(currentActionId, actionId));
    shouldFocusAfterActionSheetCloseRef.current = true;
  }, []);

  const clearSelectedTool = useCallback(() => {
    setSelectedToolId(null);
  }, []);

  const stateValue = useMemo(
    () => ({
      draft,
      isActionSheetOpen,
      isInputFocused,
      selectedAssets: {
        selectedPhotoCount: media.state.selectedPhotoCount,
        selectedPhotoOrder: media.state.selectedPhotoOrder,
      },
      selectedTool,
      selectedToolId,
    }),
    [
      draft,
      isActionSheetOpen,
      isInputFocused,
      media.state.selectedPhotoCount,
      media.state.selectedPhotoOrder,
      selectedTool,
      selectedToolId,
    ],
  );

  const actionsValue = useMemo(
    () => ({
      clearSelectedTool,
      closeActionSheet,
      openActionSheet,
      selectAction,
      setDraft,
      setInputFocused: setIsInputFocused,
    }),
    [clearSelectedTool, closeActionSheet, openActionSheet, selectAction],
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
