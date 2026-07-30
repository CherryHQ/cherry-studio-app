import { ChatScreen } from '@/features/chat';
import { ChatRuntimeProvider } from '@/features/chat/runtime';

export default function TopicsRoute() {
  return (
    <ChatRuntimeProvider>
      <ChatScreen />
    </ChatRuntimeProvider>
  );
}
