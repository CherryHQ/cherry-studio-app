import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import {
  createContext,
  type PropsWithChildren,
  type RefObject,
  type SetStateAction,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { FileEntryId } from '@/shared/data/types/file';

import { useComposerPresentation } from '../hooks/useComposerPresentation';
import {
  appendComposerAttachments,
  type ComposerAttachmentDraft,
  removeComposerAttachment,
  replaceComposerAttachment,
  type ComposerAttachmentReady,
} from '../utils/composerAttachments';

/**
 * What a caller reads to render around the composer — chat's send handler needs
 * the draft, painting's mode resolution needs the attachments. Split from the
 * actions so a component that only dispatches does not re-render on every
 * keystroke.
 */
type ComposerStateContextValue = {
  attachments: readonly ComposerAttachmentDraft[];
  draft: string;
};

type ComposerActionsContextValue = {
  addAttachments: (attachments: ComposerAttachmentDraft[]) => void;
  clearAttachments: () => void;
  removeAttachment: (attachmentId: string) => void;
  setAttachments: (attachments: ComposerAttachmentDraft[]) => void;
  replaceAttachment: (
    attachmentId: string,
    sourceId: FileEntryId,
    replacement: ComposerAttachmentReady,
  ) => boolean;
  /**
   * Replaces the whole draft. Only for the cases that own it wholesale — send
   * clearing it, a failed send restoring it with a functional update to preserve newer text. Anything that *adds* to what the
   * user wrote goes through `inputRef` instead: the field owns the buffer and
   * the caret, and a string handed in here would land at neither.
   */
  setDraft: (draft: SetStateAction<string>) => void;
};

export type ComposerAttachmentStore = Pick<
  ComposerActionsContextValue,
  | 'addAttachments'
  | 'clearAttachments'
  | 'removeAttachment'
  | 'setAttachments'
  | 'replaceAttachment'
> & {
  attachments: readonly ComposerAttachmentDraft[];
};

type ComposerMetaContextValue = {
  /**
   * The field itself, for the two things no prop can express: taking focus
   * away, and inserting an entity — a tool mention is a link, and no string
   * handed to `setDraft` would carry its URL.
   */
  inputRef: RefObject<ComposerInputHandle | null>;
};

type ComposerPresentationStateContextValue = ReturnType<typeof useComposerPresentation>['state'];
type ComposerPresentationActionsContextValue = ReturnType<
  typeof useComposerPresentation
>['actions'];

const ComposerStateContext = createContext<ComposerStateContextValue | null>(null);
const ComposerActionsContext = createContext<ComposerActionsContextValue | null>(null);
const ComposerMetaContext = createContext<ComposerMetaContextValue | null>(null);
const ComposerPresentationStateContext =
  createContext<ComposerPresentationStateContextValue | null>(null);
const ComposerPresentationActionsContext =
  createContext<ComposerPresentationActionsContextValue | null>(null);

type ComposerProviderProps = PropsWithChildren<{
  attachmentStore?: ComposerAttachmentStore;
  initialAttachments?: readonly ComposerAttachmentDraft[];
  initialDraft?: string | (() => string);
}>;

const EMPTY_ATTACHMENTS: readonly ComposerAttachmentDraft[] = [];

/**
 * The draft, its attachments, and a handle on the field — the three things both
 * the composer and its caller need, which is why they are context rather than
 * props. Anything only one caller cares about (chat's selected tool and
 * reasoning effort, painting's image params) stays that caller's own state.
 */
export function ComposerProvider({
  attachmentStore,
  children,
  initialAttachments = EMPTY_ATTACHMENTS,
  initialDraft = '',
}: ComposerProviderProps) {
  const inputRef = useRef<ComposerInputHandle | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const presentation = useComposerPresentation(inputRef);
  const [localAttachments, setLocalAttachmentState] = useState<ComposerAttachmentDraft[]>(() => [
    ...initialAttachments,
  ]);
  const localAttachmentsRef = useRef(localAttachments);
  const setLocalAttachments = useCallback((update: SetStateAction<ComposerAttachmentDraft[]>) => {
    const next = typeof update === 'function' ? update(localAttachmentsRef.current) : update;
    localAttachmentsRef.current = next;
    setLocalAttachmentState(next);
  }, []);

  const addLocalAttachments = useCallback(
    (nextAttachments: ComposerAttachmentDraft[]) => {
      setLocalAttachments((current) => appendComposerAttachments(current, nextAttachments));
    },
    [setLocalAttachments],
  );

  const removeLocalAttachment = useCallback(
    (attachmentId: string) => {
      setLocalAttachments((current) => removeComposerAttachment(current, attachmentId));
    },
    [setLocalAttachments],
  );

  const clearLocalAttachments = useCallback(() => {
    setLocalAttachments([]);
  }, [setLocalAttachments]);

  const attachments = attachmentStore?.attachments ?? localAttachments;
  const addAttachments = attachmentStore?.addAttachments ?? addLocalAttachments;
  const clearAttachments = attachmentStore?.clearAttachments ?? clearLocalAttachments;
  const removeAttachment = attachmentStore?.removeAttachment ?? removeLocalAttachment;
  const setAttachments = attachmentStore?.setAttachments ?? setLocalAttachments;
  const replaceLocalAttachment = useCallback(
    (attachmentId: string, sourceId: FileEntryId, replacement: ComposerAttachmentReady) => {
      const next = replaceComposerAttachment(
        localAttachmentsRef.current,
        attachmentId,
        sourceId,
        replacement,
      );
      if (!next) return false;
      setLocalAttachments(next);
      return true;
    },
    [setLocalAttachments],
  );
  const replaceAttachment = attachmentStore?.replaceAttachment ?? replaceLocalAttachment;

  const stateValue = useMemo(() => ({ attachments, draft }), [attachments, draft]);

  const actionsValue = useMemo(
    () => ({
      addAttachments,
      clearAttachments,
      removeAttachment,
      setAttachments,
      replaceAttachment,
      setDraft,
    }),
    [addAttachments, clearAttachments, removeAttachment, setAttachments, replaceAttachment],
  );

  const metaValue = useMemo(() => ({ inputRef }), []);

  return (
    <ComposerStateContext value={stateValue}>
      <ComposerActionsContext value={actionsValue}>
        <ComposerMetaContext value={metaValue}>
          <ComposerPresentationStateContext value={presentation.state}>
            <ComposerPresentationActionsContext value={presentation.actions}>
              {children}
            </ComposerPresentationActionsContext>
          </ComposerPresentationStateContext>
        </ComposerMetaContext>
      </ComposerActionsContext>
    </ComposerStateContext>
  );
}

export function useComposerState() {
  const context = use(ComposerStateContext);

  if (!context) {
    throw new Error('useComposerState must be used within ComposerSessionProvider');
  }

  return context;
}

export function useComposerActions() {
  const context = use(ComposerActionsContext);

  if (!context) {
    throw new Error('useComposerActions must be used within ComposerSessionProvider');
  }

  return context;
}

export function useComposerMeta() {
  const context = use(ComposerMetaContext);

  if (!context) {
    throw new Error('useComposerMeta must be used within ComposerSessionProvider');
  }

  return context;
}

export function useComposerPresentationState() {
  const context = use(ComposerPresentationStateContext);

  if (!context) {
    throw new Error('useComposerPresentationState must be used within ComposerSessionProvider');
  }

  return context;
}

export function useComposerPresentationActions() {
  const context = use(ComposerPresentationActionsContext);

  if (!context) {
    throw new Error('useComposerPresentationActions must be used within ComposerSessionProvider');
  }

  return context;
}
