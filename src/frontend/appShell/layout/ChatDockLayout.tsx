import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

const ChatDockFooterHeightContext = createContext(0);
const SetChatDockFooterHeightContext = createContext<((height: number) => void) | null>(null);

/** Shares the chat footer's measured space with the drawer's floating controls. */
export function ChatDockLayoutProvider({ children }: PropsWithChildren) {
  const [footerHeight, setFooterHeight] = useState(0);

  return (
    <SetChatDockFooterHeightContext value={setFooterHeight}>
      <ChatDockFooterHeightContext value={footerHeight}>{children}</ChatDockFooterHeightContext>
    </SetChatDockFooterHeightContext>
  );
}

export function useChatDockFooterHeight() {
  return use(ChatDockFooterHeightContext);
}

/** Owns the space below the input, including the gap before the footer content. */
export function ChatDockFooter({ children }: PropsWithChildren) {
  const setFooterHeight = use(SetChatDockFooterHeightContext);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => setFooterHeight?.(event.nativeEvent.layout.height),
    [setFooterHeight],
  );

  useEffect(() => () => setFooterHeight?.(0), [setFooterHeight]);

  return (
    <View className="pt-1" onLayout={handleLayout}>
      {children}
    </View>
  );
}
