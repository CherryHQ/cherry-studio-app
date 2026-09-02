import type { ComposerInputHandle } from '@cherrystudio/ui/components';
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
import { KeyboardController } from 'react-native-keyboard-controller';

import {
  appendComposerAttachments,
  type ComposerAttachmentDraft,
  removeComposerAttachment,
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
  /**
   * Replaces the whole draft. Only for the cases that own it wholesale — send
   * clearing it, a failed send restoring it. Anything that *adds* to what the
   * user wrote goes through `inputRef` instead: the field owns the buffer and
   * the caret, and a string handed in here would land at neither.
   */
  setDraft: (draft: string) => void;
};

export type ComposerAttachmentStore = Pick<
  ComposerActionsContextValue,
  'addAttachments' | 'clearAttachments' | 'removeAttachment' | 'setAttachments'
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

type ComposerPresentationStateContextValue = {
  /**
   * Whether the dock follows live keyboard coordinates. Replacement surfaces
   * turn this off before the keyboard starts moving, then the field turns it
   * back on only when it actually receives focus again.
   */
  isKeyboardTrackingEnabled: boolean;
};

type ComposerPresentationActionsContextValue = {
  resumeKeyboardTracking: () => void;
  /**
   * Runs a surface that replaces the live input context, such as a model
   * sheet or a native picker. The dock is pinned first, then the field is
   * blurred, the keyboard is dismissed, and one frame is left for those
   * changes to commit before the replacement is presented.
   */
  runInputReplacement: <TValue>(present: () => Promise<TValue> | TValue) => Promise<TValue>;
};

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
  initialDraft?: string;
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
  initialAttachments = [],
  initialDraft = '',
}: ComposerProviderProps) {
  const inputRef = useRef<ComposerInputHandle | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [isKeyboardTrackingEnabled, setIsKeyboardTrackingEnabled] = useState(true);
  const [localAttachments, setLocalAttachments] = useState<ComposerAttachmentDraft[]>(() => [
    ...initialAttachments,
  ]);

  const addLocalAttachments = useCallback((nextAttachments: ComposerAttachmentDraft[]) => {
    setLocalAttachments((current) => appendComposerAttachments(current, nextAttachments));
  }, []);

  const removeLocalAttachment = useCallback((attachmentId: string) => {
    setLocalAttachments((current) => removeComposerAttachment(current, attachmentId));
  }, []);

  const clearLocalAttachments = useCallback(() => {
    setLocalAttachments([]);
  }, []);

  const attachments = attachmentStore?.attachments ?? localAttachments;
  const addAttachments = attachmentStore?.addAttachments ?? addLocalAttachments;
  const clearAttachments = attachmentStore?.clearAttachments ?? clearLocalAttachments;
  const removeAttachment = attachmentStore?.removeAttachment ?? removeLocalAttachment;
  const setAttachments = attachmentStore?.setAttachments ?? setLocalAttachments;

  const stateValue = useMemo(() => ({ attachments, draft }), [attachments, draft]);

  const actionsValue = useMemo(
    () => ({
      addAttachments,
      clearAttachments,
      removeAttachment,
      setAttachments,
      setDraft,
    }),
    [addAttachments, clearAttachments, removeAttachment, setAttachments],
  );

  const metaValue = useMemo(() => ({ inputRef }), []);

  const resumeKeyboardTracking = useCallback(() => {
    setIsKeyboardTrackingEnabled(true);
  }, []);

  const runInputReplacement = useCallback(
    async <TValue,>(present: () => Promise<TValue> | TValue): Promise<TValue> => {
      // Decouple the dock before asking the keyboard to move. On Android an
      // external Activity can otherwise restore a stale animated keyboard
      // coordinate and leave the composer translated away from its hit area.
      setIsKeyboardTrackingEnabled(false);
      inputRef.current?.blur();

      try {
        await KeyboardController.dismiss();
      } finally {
        // A picker can be launched while the menu's closing press is still
        // committing. Leave one frame for the closed UI to become inert before
        // Android hands control to another Activity.
        await waitForNextFrame();
      }

      return present();
    },
    [],
  );

  const presentationStateValue = useMemo(
    () => ({ isKeyboardTrackingEnabled }),
    [isKeyboardTrackingEnabled],
  );
  const presentationActionsValue = useMemo(
    () => ({ resumeKeyboardTracking, runInputReplacement }),
    [resumeKeyboardTracking, runInputReplacement],
  );

  return (
    <ComposerStateContext value={stateValue}>
      <ComposerActionsContext value={actionsValue}>
        <ComposerMetaContext value={metaValue}>
          <ComposerPresentationStateContext value={presentationStateValue}>
            <ComposerPresentationActionsContext value={presentationActionsValue}>
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

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
