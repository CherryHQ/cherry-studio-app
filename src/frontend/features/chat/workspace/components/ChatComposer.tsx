import { ComposerDock, ManagedComposerProvider } from '@/frontend/components/composer';

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
 * that shows the input (chat + new-topic) imports attachments before preview. The
 * reasoning-effort control lives inside the model picker sheet
 * (ChatInputReasoningSection), not as a separate floating panel.
 */
export function ChatComposer({
  assistantId,
  dismissKeyboardOnSend,
  onHeightChange,
  topicId,
}: ChatComposerProps) {
  return (
    <ManagedComposerProvider>
      <ComposerDock onHeightChange={onHeightChange}>
        <ChatInput
          assistantId={assistantId}
          dismissKeyboardOnSend={dismissKeyboardOnSend}
          topicId={topicId}
        />
      </ComposerDock>
    </ManagedComposerProvider>
  );
}
