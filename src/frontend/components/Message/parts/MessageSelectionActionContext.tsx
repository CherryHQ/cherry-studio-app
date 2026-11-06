import { createContext, type ReactNode, use } from 'react';

export type MessageSelectionAction = {
  label: string;
  onPress: (selection: { messageId: string; text: string }) => void;
};

/** One host action beside Copy in the native menu of a message's selected Markdown text. */
const MessageSelectionActionContext = createContext<MessageSelectionAction | undefined>(undefined);

export function MessageSelectionActionProvider({
  action,
  children,
}: {
  action?: MessageSelectionAction;
  children: ReactNode;
}) {
  return <MessageSelectionActionContext value={action}>{children}</MessageSelectionActionContext>;
}

export function useMessageSelectionAction() {
  return use(MessageSelectionActionContext);
}
