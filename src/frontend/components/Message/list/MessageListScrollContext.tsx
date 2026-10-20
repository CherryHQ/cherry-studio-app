import { createContext, use } from 'react';
import type { View } from 'react-native';
import type { AnimatedRef, SharedValue } from 'react-native-reanimated';

/**
 * The list geometry a row needs to pin part of itself under the list's top inset while the rest
 * scrolls, and to bring its own top back there.
 */
export type MessageListScroll = Readonly<{
  /** Measured on the UI thread beside a row to place it relative to the visible area. */
  listRef: AnimatedRef<View>;
  scrollOffset: SharedValue<number>;
  scrollToOffset: (offset: number) => void;
  /** Content above this distance from the list's top sits under the header. */
  topInset: number;
}>;

const MessageListScrollContext = createContext<MessageListScroll | null>(null);

export const MessageListScrollProvider = MessageListScrollContext.Provider;

/** Absent outside a message list, where nothing scrolls under a header. */
export function useMessageListScroll() {
  return use(MessageListScrollContext);
}
