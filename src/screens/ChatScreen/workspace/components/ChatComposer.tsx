import { ChatInputProvider } from '../../input/context/ChatInputProvider';
import { FloatingChatInput } from './FloatingChatInput';

type ChatComposerProps = {
  onHeightChange: (height: number) => void;
  topicId?: string;
};

/**
 * The floating composer wrapped in the shared ChatInputProvider, so every
 * screen that shows the input (chat + new-topic) gets the provider with it.
 * The reasoning-effort control lives inside the model picker sheet
 * (ChatInputReasoningSection), not as a separate floating panel.
 */
export function ChatComposer({ onHeightChange, topicId }: ChatComposerProps) {
  return (
    <ChatInputProvider>
      <FloatingChatInput onHeightChange={onHeightChange} topicId={topicId} />
    </ChatInputProvider>
  );
}
