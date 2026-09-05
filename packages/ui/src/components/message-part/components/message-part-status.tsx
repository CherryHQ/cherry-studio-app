import { createContext, type ReactNode, useContext } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { MessagePartStatusProps } from '../message-part.types';

type MessagePartStatusDensity = 'compact' | 'default';

const MessagePartStatusDensityContext = createContext<MessagePartStatusDensity>('default');
const statusClassName = '-mx-2 flex-row items-center gap-1.5 rounded-lg px-2';
const statusDensityClassName = {
  compact: 'min-h-8 py-0.5',
  default: 'min-h-10 py-1',
} as const satisfies Record<MessagePartStatusDensity, string>;

export function MessagePartStatusDensityScope({
  children,
  density,
}: {
  children: ReactNode;
  density: MessagePartStatusDensity;
}) {
  return (
    <MessagePartStatusDensityContext value={density}>{children}</MessagePartStatusDensityContext>
  );
}

export function MessagePartStatus({
  accessibilityLabel,
  children,
  expanded,
  onPress,
  testID,
}: MessagePartStatusProps) {
  const density = useContext(MessagePartStatusDensityContext);
  const densityClassName = statusDensityClassName[density];

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={expanded === undefined ? undefined : { expanded }}
        className={`${statusClassName} ${densityClassName} active:opacity-80`}
        hitSlop={density === 'compact' ? 6 : 4}
        onPress={onPress}
        testID={testID}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      className={`${statusClassName} ${densityClassName}`}
      testID={testID}
    >
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
