import { ChatInputActionSheet } from '@/screens/ChatScreen/input/components/ChatInputActionSheet';
import { ChatInputSurface } from '@/screens/ChatScreen/input/components/ChatInputSurface';
import { ChatInputProvider } from '@/screens/ChatScreen/input/context/ChatInputProvider';

export function ChatInput() {
  return (
    <ChatInputProvider>
      <ChatInputSurface />
      <ChatInputActionSheet />
    </ChatInputProvider>
  );
}
