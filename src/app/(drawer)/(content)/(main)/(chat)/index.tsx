import { StartupInteractiveMarker } from '@/frontend/appShell/observability';
import { ChatScreen } from '@/frontend/features/chat';

export default function ChatRoute() {
  return (
    <>
      <StartupInteractiveMarker />
      <ChatScreen />
    </>
  );
}
