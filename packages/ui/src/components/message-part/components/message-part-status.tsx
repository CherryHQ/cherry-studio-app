import { Pressable, Text, View } from 'react-native';

import type { MessagePartStatusProps } from '../message-part.types';

const statusClassName = 'flex-row items-center gap-2 py-0.5';

export function MessagePartStatus({
  accessibilityLabel,
  children,
  onPress,
  testID,
}: MessagePartStatusProps) {
  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className={`${statusClassName} active:opacity-60`}
        onPress={onPress}
        testID={testID}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View accessibilityLabel={accessibilityLabel} className={statusClassName} testID={testID}>
      {children}
    </View>
  );
}

export function MessagePartStatusTextFloor() {
  return (
    <Text accessible={false} className="text-base">
      {'\u00A0'}
    </Text>
  );
}
