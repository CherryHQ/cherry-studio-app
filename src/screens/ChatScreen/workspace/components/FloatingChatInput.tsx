import { useCallback } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  chatInputHorizontalScreenInset,
  chatInputMinBottomPadding,
} from '../../input/chatInputLayout';
import { ChatInput } from '../../input';

type FloatingChatInputProps = {
  onHeightChange: (height: number) => void;
};

export function FloatingChatInput({ onHeightChange }: FloatingChatInputProps) {
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
      pointerEvents="box-none"
      style={[styles.layer, { paddingBottom: bottomPadding }]}
      onLayout={handleLayout}
    >
      <KeyboardStickyView offset={{ opened: keyboardInputOffset }}>
        <ChatInput />
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    bottom: 0,
    left: 0,
    paddingHorizontal: chatInputHorizontalScreenInset,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
});
