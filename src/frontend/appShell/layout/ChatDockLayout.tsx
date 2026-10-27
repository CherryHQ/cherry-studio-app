import { useHeaderHeight } from 'expo-router/react-navigation';
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
const ChatHeaderHeightContext = createContext(0);
const SetChatHeaderHeightContext = createContext<((height: number) => void) | null>(null);

/**
 * Shares the chat's header height and footer space with the drawer, so the sidebar's floating
 * title row and dock line up with the chat's own controls.
 */
export function ChatDockLayoutProvider({ children }: PropsWithChildren) {
  const [footerHeight, setFooterHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  return (
    <SetChatHeaderHeightContext value={setHeaderHeight}>
      <ChatHeaderHeightContext value={headerHeight}>
        <SetChatDockFooterHeightContext value={setFooterHeight}>
          <ChatDockFooterHeightContext value={footerHeight}>{children}</ChatDockFooterHeightContext>
        </SetChatDockFooterHeightContext>
      </ChatHeaderHeightContext>
    </SetChatHeaderHeightContext>
  );
}

/** The chat's native header height, or 0 before a chat has laid it out. */
export function useChatHeaderHeight() {
  return use(ChatHeaderHeightContext);
}

/** Publishes the chat stack's header height; call from the chat header. */
export function useReportChatHeaderHeight() {
  const setHeaderHeight = use(SetChatHeaderHeightContext);
  const headerHeight = useHeaderHeight();
  useEffect(() => {
    setHeaderHeight?.(headerHeight);
  }, [headerHeight, setHeaderHeight]);
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
