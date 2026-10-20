import { createContext, use } from 'react';

const ChatSessionContext = createContext<string | undefined>(undefined);

/** The Session whose transcript the rows below render; absent for a draft. */
export const ChatSessionProvider = ChatSessionContext.Provider;

export function useChatSessionId() {
  return use(ChatSessionContext);
}
