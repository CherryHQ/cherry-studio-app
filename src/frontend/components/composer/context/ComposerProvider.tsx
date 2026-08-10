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
  setDraft: (draft: string) => void;
};

export type ComposerAttachmentStore = Pick<
  ComposerActionsContextValue,
  'addAttachments' | 'clearAttachments' | 'removeAttachment' | 'setAttachments'
> & {
  attachments: readonly ComposerAttachmentDraft[];
};

type ComposerMetaContextValue = {
  inputRef: RefObject<TextInput | null>;
};

const ComposerStateContext = createContext<ComposerStateContextValue | null>(null);
const ComposerActionsContext = createContext<ComposerActionsContextValue | null>(null);
const ComposerMetaContext = createContext<ComposerMetaContextValue | null>(null);

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
  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState(initialDraft);
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

  return (
    <ComposerStateContext value={stateValue}>
      <ComposerActionsContext value={actionsValue}>
        <ComposerMetaContext value={metaValue}>{children}</ComposerMetaContext>
      </ComposerActionsContext>
    </ComposerStateContext>
  );
}

export function useComposerState() {
  const context = use(ComposerStateContext);

  if (!context) {
    throw new Error('useComposerState must be used within ComposerProvider');
  }

  return context;
}

export function useComposerActions() {
  const context = use(ComposerActionsContext);

  if (!context) {
    throw new Error('useComposerActions must be used within ComposerProvider');
  }

  return context;
}

export function useComposerMeta() {
  const context = use(ComposerMetaContext);

  if (!context) {
    throw new Error('useComposerMeta must be used within ComposerProvider');
  }

  return context;
}
