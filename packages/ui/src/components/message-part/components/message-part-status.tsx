import { Pressable, Text, View } from 'react-native';

import type { MessagePartStatusProps } from '../message-part.types';

const statusClassName = '-mx-2 min-h-10 flex-row items-center gap-1.5 rounded-lg px-2 py-1';

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
        className={`${statusClassName} active:bg-secondary-active active:opacity-80`}
        hitSlop={4}
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
    <Text accessible={false} className="text-sm">
      {'\u00A0'}
    </Text>
  );
}
