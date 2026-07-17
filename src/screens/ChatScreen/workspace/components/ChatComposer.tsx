import type { SharedValue } from 'react-native-reanimated';

import { ChatInputReasoningPanel } from '../../input/components/ChatInputReasoningPanel';
import { ChatInputProvider } from '../../input/context/ChatInputProvider';
import { FloatingChatInput } from './FloatingChatInput';

type ChatComposerProps = {
  onHeightChange: (height: number) => void;
  /** Live floating-input height; positions the reasoning panel above it. */
  inputHeight: SharedValue<number>;
  topicId?: string;
};

/**
 * The floating composer plus its reasoning panel, wrapped in the shared
 * ChatInputProvider. Keeping the three together in one component means every
 * screen that shows the input (chat + new-topic) gets the provider and the
 * panel, so neither can drift out of the tree again.
 */
export function ChatComposer({ onHeightChange, inputHeight, topicId }: ChatComposerProps) {
  return (
    <ChatInputProvider>
      <FloatingChatInput onHeightChange={onHeightChange} topicId={topicId} />
      <ChatInputReasoningPanel inputHeight={inputHeight} />
    </ChatInputProvider>
  );
}
