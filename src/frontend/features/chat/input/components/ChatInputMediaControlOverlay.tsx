import { Portal } from 'heroui-native/portal';
import { type ReactNode, useId } from 'react';
import { StyleSheet, View } from 'react-native';

type ChatInputMediaControlOverlayProps = {
  children: ReactNode;
};

export function ChatInputMediaControlOverlay({ children }: ChatInputMediaControlOverlayProps) {
  const id = useId();

  return (
    <Portal name={`chat-input-media-controls-${id}`}>
      <View
        collapsable={false}
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}
        testID="chat-input-media-control-overlay"
      >
        {children}
      </View>
    </Portal>
  );
}
