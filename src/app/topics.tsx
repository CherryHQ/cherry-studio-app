import { ChatScreen } from '@/frontend/features/chat';
import { ChatRuntimeProvider } from '@/frontend/features/chat/runtime';

export default function TopicsRoute() {
  return (
    <ChatRuntimeProvider>
      <ChatScreen />
    </ChatRuntimeProvider>
  );
}
