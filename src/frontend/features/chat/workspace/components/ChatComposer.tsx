import { Composer } from '@cherrystudio/ui/components';

import { ManagedComposerProvider } from '@/frontend/components/composer';

import { ChatInput } from '../../input';

type ChatComposerProps = {
  /** Assistant to bind a newly created topic to; ignored once `topicId` exists. */
  assistantId?: string;
  dismissKeyboardOnSend?: boolean;
  onHeightChange: (height: number) => void;
  topicId?: string;
};

/**
 * The docked chat input, wrapped in the managed Composer provider so every screen
 * that shows the input (chat + new-topic) imports attachments before preview.
 * ChatInput owns the reasoning-effort morph because it is assistant/model state,
 * while this wrapper owns only docking and composer storage.
 */
export function ChatComposer({
  assistantId,
  dismissKeyboardOnSend,
  onHeightChange,
  topicId,
}: ChatComposerProps) {
  return (
    <ManagedComposerProvider>
      <Composer.Dock onHeightChange={onHeightChange}>
        <ChatInput
          assistantId={assistantId}
          dismissKeyboardOnSend={dismissKeyboardOnSend}
          topicId={topicId}
        />
      </Composer.Dock>
    </ManagedComposerProvider>
  );
}
