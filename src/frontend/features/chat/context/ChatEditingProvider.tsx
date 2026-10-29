import { createContext, type PropsWithChildren, useContext, useMemo, useState } from 'react';

export type ChatEditingTarget = {
  /** The settled user message being edited; it stays in the tree as an unselected branch. */
  messageId: string;
  /** The sent text the composer draft starts from, including mention labels. */
  initialText: string;
};

type ChatEditingContextValue = {
  editing: ChatEditingTarget | null;
  /** Opens the composer as an editing session over the transcript; the draft becomes the question. */
  beginEdit: (target: ChatEditingTarget) => void;
  /** Ends the editing session without sending; the composer restores its own draft. */
  endEdit: () => void;
};

const ChatEditingContext = createContext<ChatEditingContextValue>({
  editing: null,
  beginEdit: () => {},
  endEdit: () => {},
});

/**
 * The edit action on a sent question and the composer sit in different subtrees
 * (transcript vs dock); this carries the editing session between them.
 */
export function ChatEditingProvider({ children }: PropsWithChildren) {
  const [editing, setEditing] = useState<ChatEditingTarget | null>(null);
  const value = useMemo(
    () => ({
      editing,
      beginEdit: (target: ChatEditingTarget) => setEditing(target),
      endEdit: () => setEditing(null),
    }),
    [editing],
  );
  return <ChatEditingContext value={value}>{children}</ChatEditingContext>;
}

export function useChatEditing(): ChatEditingContextValue {
  return useContext(ChatEditingContext);
}
