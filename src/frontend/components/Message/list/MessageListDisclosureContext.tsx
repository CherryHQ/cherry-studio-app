import { createContext, type ReactNode, use } from 'react';

const ignoreDisclosureToggle = () => {};

const MessageListDisclosureContext = createContext<(() => void) | undefined>(undefined);

type MessageListDisclosureProviderProps = {
  children: ReactNode;
  onDisclosureToggle: () => void;
};

export function MessageListDisclosureProvider({
  children,
  onDisclosureToggle,
}: MessageListDisclosureProviderProps) {
  return (
    <MessageListDisclosureContext value={onDisclosureToggle}>
      {children}
    </MessageListDisclosureContext>
  );
}

export function useMessageListDisclosureToggle() {
  return use(MessageListDisclosureContext) ?? ignoreDisclosureToggle;
}
