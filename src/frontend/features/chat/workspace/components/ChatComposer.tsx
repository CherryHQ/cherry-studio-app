import type { RefObject } from 'react';
import type { LayoutChangeEvent, View } from 'react-native';

import { ComposerDock, ComposerProvider } from '@/frontend/components/composer';

import { ChatInput } from '../../input';

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
 * The docked chat input, wrapped in the shared ComposerProvider so every screen
 * that shows the input (chat + new-topic) gets the provider with it. The
 * reasoning-effort control lives inside the model picker sheet
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
    <ComposerProvider>
      <ComposerDock
        containerRef={composerRef}
        onHeightChange={onHeightChange}
        onLayout={onComposerLayout}
      >
        <ChatInput
          assistantId={assistantId}
          dismissKeyboardOnSend={dismissKeyboardOnSend}
          topicId={topicId}
        />
      </ComposerDock>
    </ComposerProvider>
  );
}
