import { ChatScreen } from '@/screens/ChatScreen';
import { ChatRuntimeProvider } from '@/screens/ChatScreen/runtime';

export default function TopicsRoute() {
  return (
    <ChatRuntimeProvider>
      <ChatScreen />
    </ChatRuntimeProvider>
  );
}
