import type { RefObject } from 'react';
import type { LayoutChangeEvent, View } from 'react-native';

import { ChatInputProvider } from '../../input/context/ChatInputProvider';
import { FloatingChatInput } from './FloatingChatInput';

type ChatComposerProps = {
  /** Assistant to bind a newly created topic to; ignored once `topicId` exists. */
  assistantId?: string;
  composerRef?: RefObject<View | null>;
  dismissKeyboardOnSend?: boolean;
  onHeightChange: (height: number) => void;
  onComposerLayout?: (event: LayoutChangeEvent) => void;
  topicId?: string;
};

/**
 * The floating composer wrapped in the shared ChatInputProvider, so every
 * screen that shows the input (chat + new-topic) gets the provider with it.
 * The reasoning-effort control lives inside the model picker sheet
 * (ChatInputReasoningSection), not as a separate floating panel.
 */
export function ChatComposer({
  assistantId,
  composerRef,
  dismissKeyboardOnSend,
  onHeightChange,
  onComposerLayout,
  topicId,
}: ChatComposerProps) {
  return (
    <ChatInputProvider>
      <FloatingChatInput
        assistantId={assistantId}
        composerRef={composerRef}
        dismissKeyboardOnSend={dismissKeyboardOnSend}
        onComposerLayout={onComposerLayout}
        onHeightChange={onHeightChange}
        topicId={topicId}
      />
    </ChatInputProvider>
  );
}
