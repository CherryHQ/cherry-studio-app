import { FirstUseGate } from '@/frontend/appShell/navigation';
import { StartupInteractiveMarker } from '@/frontend/appShell/observability';
import { ChatScreen } from '@/frontend/features/chat';
import { ChatProvider } from '@/frontend/features/chat/runtime';

export default function ChatRoute() {
  return (
    <FirstUseGate>
      <ChatProvider>
        <StartupInteractiveMarker />
        <ChatScreen />
      </ChatProvider>
    </FirstUseGate>
  );
}
