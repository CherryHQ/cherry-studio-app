import { ChatScreen } from '@/frontend/features/chat';
import { ChatProvider } from '@/frontend/features/chat/runtime';

export default function ChatRoute() {
  return (
    <ChatProvider>
      <ChatScreen />
    </ChatProvider>
  );
}
