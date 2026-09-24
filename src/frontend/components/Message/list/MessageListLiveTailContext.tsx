import { createContext, type ReactNode, use } from 'react';

// Outside a message list (previews, share screens) streaming content is always shown.
const MessageListLiveTailContext = createContext(true);

type MessageListLiveTailProviderProps = {
  children: ReactNode;
  isVisible: boolean;
};

/** Publishes whether the list's growing end is on screen or about to be. */
export function MessageListLiveTailProvider({
  children,
  isVisible,
}: MessageListLiveTailProviderProps) {
  return <MessageListLiveTailContext value={isVisible}>{children}</MessageListLiveTailContext>;
}

export function useMessageListLiveTailVisible() {
  return use(MessageListLiveTailContext);
}
