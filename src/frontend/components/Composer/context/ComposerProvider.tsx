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
import type {
  ComposerAttachmentDraft,
  ComposerAttachmentReady,
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
  isSubmitting: boolean;
};

type ComposerActionsContextValue = {
  beginSendAttempt: () => number | null;
  endSendAttempt: () => void;
  /** User edits relinquish any caller-owned draft operation before changing the text. */
  editDraft: (draft: string) => void;
  /** Announces user edits and accepted send attempts, including changes to an empty draft. */
  subscribeDraftEdits: (listener: () => void) => () => void;
  subscribeAttachmentChanges?: (
    listener: (attachments: readonly ComposerAttachmentDraft[]) => void,
  ) => () => void;
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
   * clearing it, a failed send restoring it with a functional update to preserve newer text,
   * dictation rewriting its live text only while the draft is still what it wrote. Anything that *adds* to what the
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
  | 'subscribeAttachmentChanges'
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
  attachmentStore: ComposerAttachmentStore;
  initialDraft?: string | (() => string);
}>;

/**
 * The draft, its attachments, and a handle on the field — the three things both
 * the composer and its caller need, which is why they are context rather than
 * props. Anything only one caller cares about (chat's selected tool and
 * reasoning effort, painting's image params) stays that caller's own state.
 */
export function ComposerProvider({
  attachmentStore,
  children,
  initialDraft = '',
}: ComposerProviderProps) {
  const inputRef = useRef<ComposerInputHandle | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const draftEditListeners = useRef(new Set<() => void>());
  const subscribeDraftEdits = useCallback((listener: () => void) => {
    draftEditListeners.current.add(listener);
    return () => {
      draftEditListeners.current.delete(listener);
    };
  }, []);
  const editDraft = useCallback((next: string) => {
    draftEditListeners.current.forEach((listener) => listener());
    setDraft(next);
  }, []);
  const activeSendAttemptIdRef = useRef<number | null>(null);
  const nextSendAttemptIdRef = useRef(0);
  // The surface may remount while file preparation or draft recovery is pending.
  const beginSendAttempt = useCallback(() => {
    if (activeSendAttemptIdRef.current !== null) return null;
    const attemptId = ++nextSendAttemptIdRef.current;
    activeSendAttemptIdRef.current = attemptId;
    draftEditListeners.current.forEach((listener) => listener());
    setIsSubmitting(true);
    return attemptId;
  }, []);
  const endSendAttempt = useCallback(() => {
    activeSendAttemptIdRef.current = null;
    setIsSubmitting(false);
  }, []);
  const presentation = useComposerPresentation(inputRef);
  const {
    addAttachments,
    attachments,
    clearAttachments,
    removeAttachment,
    replaceAttachment,
    setAttachments,
    subscribeAttachmentChanges,
  } = attachmentStore;

  const stateValue = useMemo(
    () => ({ attachments, draft, isSubmitting }),
    [attachments, draft, isSubmitting],
  );

  const actionsValue = useMemo(
    () => ({
      beginSendAttempt,
      endSendAttempt,
      editDraft,
      subscribeDraftEdits,
      addAttachments,
      clearAttachments,
      removeAttachment,
      setAttachments,
      replaceAttachment,
      setDraft,
      subscribeAttachmentChanges,
    }),
    [
      beginSendAttempt,
      endSendAttempt,
      editDraft,
      subscribeDraftEdits,
      addAttachments,
      clearAttachments,
      removeAttachment,
      setAttachments,
      replaceAttachment,
      subscribeAttachmentChanges,
    ],
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
