import { ChatScreen } from '@/frontend/features/chat';
import { ChatSessionProvider } from '@/frontend/features/chat/session';

export default function TopicsRoute() {
  return (
    <ChatSessionProvider>
      <ChatScreen />
    </ChatSessionProvider>
  );
}
