import { ComposerDock, ComposerProvider } from '@/frontend/components/composer';

import { ChatInput } from '../../input';
import { useManagedComposerAttachments } from '../../input/hooks/useManagedComposerAttachments';

type ChatComposerProps = {
  /** Assistant to bind a newly created topic to; ignored once `topicId` exists. */
  assistantId?: string;
  dismissKeyboardOnSend?: boolean;
  onHeightChange: (height: number) => void;
  topicId?: string;
};

/**
 * The docked chat input, wrapped in the shared ComposerProvider so every screen
 * that shows the input (chat + new-topic) gets the provider with it. The
 * reasoning-effort control lives inside the model picker sheet
 * (ChatInputReasoningSection), not as a separate floating panel.
 */
export function ChatComposer({
  assistantId,
  dismissKeyboardOnSend,
  onHeightChange,
  topicId,
}: ChatComposerProps) {
  const attachmentStore = useManagedComposerAttachments();

  return (
    <ComposerProvider attachmentStore={attachmentStore}>
      <ComposerDock onHeightChange={onHeightChange}>
        <ChatInput
          assistantId={assistantId}
          dismissKeyboardOnSend={dismissKeyboardOnSend}
          topicId={topicId}
        />
      </ComposerDock>
    </ComposerProvider>
  );
}
