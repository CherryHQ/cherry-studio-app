import { FirstUseGate } from '@/frontend/appShell/navigation';
import { StartupInteractiveMarker } from '@/frontend/appShell/observability';
import { ChatScreen } from '@/frontend/features/chat';

export default function ChatRoute() {
  return (
    <FirstUseGate>
      <StartupInteractiveMarker />
      <ChatScreen />
    </FirstUseGate>
  );
}
