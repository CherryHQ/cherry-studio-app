import { useToast } from 'heroui-native/toast';
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
import { useTranslation } from 'react-i18next';
import { type TextInput } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { loggerService } from '@/shared/core/logger/LoggerService';

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
  type ChatInputAttachmentReady,
  type ChatInputAttachmentSource,
  type ChatInputInitialAttachment,
  isChatInputAttachmentReady,
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
  addAttachments: (attachments: ChatInputAttachmentSource[]) => void;
  clearAttachments: () => void;
  clearReasoningEffort: () => void;
  clearSelectedTool: () => void;
  closeActionSheet: () => void;
  openActionSheet: () => void;
  removeAttachment: (attachmentId: string) => void;
  selectAction: (actionId: ChatInputActionId) => void;
  selectReasoningEffort: (reasoningEffort: ChatInputReasoningEffort) => void;
  setSelectedTool: (actionId: ChatInputActionId | null) => void;
  setAttachments: (attachments: ChatInputAttachmentReady[]) => void;
  setDraft: (draft: string) => void;
  setInputFocused: (isFocused: boolean) => void;
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
  initialAttachments?: readonly ChatInputInitialAttachment[];
  initialDraft?: string;
}>;

const logger = loggerService.withContext('ChatInputProvider');
const emptyInitialAttachments: readonly ChatInputInitialAttachment[] = [];

type ImportResult = 'failed' | 'ignored' | 'ready';

export function ChatInputProvider({
  children,
  initialAttachments = emptyInitialAttachments,
  initialDraft = '',
}: ChatInputProviderProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const file = useBackendModule('file');
  const inputRef = useRef<TextInput>(null);
  const initialAttachmentsRef = useRef(initialAttachments);
  const didImportInitialAttachmentsRef = useRef(false);
  const isMountedRef = useRef(true);
  const importTokensRef = useRef(new Map<string, symbol>());
  const cancelledImportTokensRef = useRef(new Set<symbol>());
  const [draft, setDraft] = useState(initialDraft);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isReasoningEffortSelected, setIsReasoningEffortSelected] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ChatInputReasoningEffort>(
    CHAT_INPUT_DEFAULT_REASONING_EFFORT,
  );
  const [attachments, setAttachmentState] = useState<ChatInputAttachmentDraft[]>(() =>
    initialAttachments.map((attachment) =>
      isChatInputAttachmentReady(attachment)
        ? attachment
        : { ...attachment, status: 'importing' as const },
    ),
  );
  const attachmentsRef = useRef(attachments);
  const [selectedToolId, setSelectedToolId] = useState<ChatInputActionId | null>(null);

  const commitAttachments = useCallback((nextAttachments: ChatInputAttachmentDraft[]) => {
    attachmentsRef.current = nextAttachments;
    setAttachmentState(nextAttachments);
  }, []);

  const discardEntry = useCallback(
    async (entryId: ChatInputAttachmentReady['fileEntryId']) => {
      try {
        await file.deleteIfUnreferenced(entryId);
      } catch (error) {
        logger.warn('Failed to discard an unreferenced attachment', toError(error), { entryId });
      }
    },
    [file],
  );

  const importAttachment = useCallback(
    async (source: ChatInputAttachmentSource, token: symbol): Promise<ImportResult> => {
      try {
        const resolved = await file.createInternalEntry({
          name: source.name,
          uri: source.uri,
        });

        if (cancelledImportTokensRef.current.delete(token)) {
          await discardEntry(resolved.entry.id);
          return 'ignored';
        }
        if (!isMountedRef.current) {
          return 'ignored';
        }
        if (importTokensRef.current.get(source.id) !== token) {
          await discardEntry(resolved.entry.id);
          return 'ignored';
        }

        importTokensRef.current.delete(source.id);
        commitAttachments(
          attachmentsRef.current.map((attachment) =>
            attachment.id === source.id && attachment.status === 'importing'
              ? {
                  ...source,
                  fileEntryId: resolved.entry.id,
                  size: resolved.entry.origin === 'internal' ? resolved.entry.size : source.size,
                  status: 'ready' as const,
                  uri: resolved.uri,
                }
              : attachment,
          ),
        );
        return 'ready';
      } catch (error) {
        if (cancelledImportTokensRef.current.delete(token)) {
          return 'ignored';
        }
        if (importTokensRef.current.get(source.id) !== token) {
          return 'ignored';
        }
        if (!isMountedRef.current) {
          return 'ignored';
        }

        importTokensRef.current.delete(source.id);
        commitAttachments(removeChatInputAttachment(attachmentsRef.current, source.id));
        logger.warn('Failed to import an attachment', toError(error), {
          name: source.name,
          uri: source.uri,
        });
        return 'failed';
      }
    },
    [commitAttachments, discardEntry, file],
  );

  const importAttachments = useCallback(
    async (sources: readonly ChatInputAttachmentSource[]) => {
      const pending = sources.map((source) => {
        const token = Symbol(source.id);
        importTokensRef.current.set(source.id, token);
        return importAttachment(source, token);
      });
      const results = await Promise.all(pending);
      const failureCount = results.filter((result) => result === 'failed').length;

      if (isMountedRef.current && failureCount > 0) {
        toast.show({
          label: t('chat.attachments.importFailed', { count: failureCount }),
          variant: 'danger',
        });
      }
    },
    [importAttachment, t, toast],
  );

  const addAttachments = useCallback(
    (sources: ChatInputAttachmentSource[]) => {
      const seenIds = new Set(attachmentsRef.current.map((attachment) => attachment.id));
      const acceptedSources = sources.filter((source) => {
        if (seenIds.has(source.id)) {
          return false;
        }
        seenIds.add(source.id);
        return true;
      });
      if (acceptedSources.length === 0) {
        return;
      }

      const importingAttachments = acceptedSources.map(
        (source): ChatInputAttachmentDraft => ({ ...source, status: 'importing' }),
      );
      commitAttachments(appendChatInputAttachments(attachmentsRef.current, importingAttachments));
      void importAttachments(acceptedSources);
    },
    [commitAttachments, importAttachments],
  );
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

  const syncReasoningEffort = useCallback((nextReasoningEffort: ChatInputReasoningEffort) => {
    setReasoningEffort(nextReasoningEffort);
  }, []);

  const clearSelectedTool = useCallback(() => {
    setSelectedToolId(null);
  }, []);

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      const attachment = attachmentsRef.current.find((item) => item.id === attachmentId);
      if (!attachment) {
        return;
      }

      const importToken = importTokensRef.current.get(attachmentId);
      if (importToken) {
        importTokensRef.current.delete(attachmentId);
        cancelledImportTokensRef.current.add(importToken);
      }
      commitAttachments(removeChatInputAttachment(attachmentsRef.current, attachmentId));
      if (attachment.status === 'ready') {
        void discardEntry(attachment.fileEntryId);
      }
    },
    [commitAttachments, discardEntry],
  );

  const clearAttachments = useCallback(() => {
    importTokensRef.current.clear();
    commitAttachments([]);
  }, [commitAttachments]);

  const setAttachments = useCallback(
    (nextAttachments: ChatInputAttachmentReady[]) => {
      importTokensRef.current.clear();
      commitAttachments([...nextAttachments]);
    },
    [commitAttachments],
  );

  useEffect(() => {
    isMountedRef.current = true;
    if (!didImportInitialAttachmentsRef.current) {
      didImportInitialAttachmentsRef.current = true;
      const sources = initialAttachmentsRef.current.filter(
        (attachment): attachment is ChatInputAttachmentSource =>
          !isChatInputAttachmentReady(attachment),
      );
      if (sources.length > 0) {
        void importAttachments(sources);
      }
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [importAttachments]);

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
      setSelectedTool: setSelectedToolId,
      setAttachments,
      setDraft,
      setInputFocused: setIsInputFocused,
      syncReasoningEffort,
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
      setAttachments,
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

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
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
