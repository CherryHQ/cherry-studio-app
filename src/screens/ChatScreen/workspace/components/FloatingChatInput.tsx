import { useCallback } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatInput } from '../../input';
import {
  chatInputHorizontalScreenInset,
  chatInputMinBottomPadding,
} from '../../input/chatInputLayout';

type FloatingChatInputProps = {
  onHeightChange: (height: number) => void;
  topicId?: string;
};

export function FloatingChatInput({ onHeightChange, topicId }: FloatingChatInputProps) {
  const { bottom } = useSafeAreaInsets();
  const bottomPadding = Math.max(bottom, chatInputMinBottomPadding);
  const keyboardInputOffset = Math.max(bottom - chatInputMinBottomPadding, 0);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onHeightChange(event.nativeEvent.layout.height);
    },
    [onHeightChange],
  );

  return (
    <View
      className="absolute right-0 bottom-0 left-0 z-10"
      pointerEvents="box-none"
      style={{
        paddingBottom: bottomPadding,
        paddingHorizontal: chatInputHorizontalScreenInset,
      }}
      onLayout={handleLayout}
    >
      <KeyboardStickyView offset={{ opened: keyboardInputOffset }}>
        <ChatInput topicId={topicId} />
      </KeyboardStickyView>
    </View>
  );
}
