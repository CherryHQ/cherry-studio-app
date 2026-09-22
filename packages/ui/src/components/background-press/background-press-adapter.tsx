import { Pressable, View } from 'react-native';

import type { BackgroundPressAdapterProps } from './background-press.types';

const ignoreLongPress = () => {};

/** Web fallback; native targets use platform recognition without a JS responder. */
export function BackgroundPressAdapter({
  enabled,
  mode,
  onBackgroundPress,
  onBackgroundTouchStart,
  onTouchStart,
  ...props
}: BackgroundPressAdapterProps) {
  return mode === 'exclusion' ? (
    <View {...props} onTouchStart={onTouchStart} />
  ) : (
    <Pressable
      {...props}
      disabled={!enabled}
      onLongPress={ignoreLongPress}
      onPressIn={(event) => {
        onBackgroundTouchStart(event.nativeEvent);
        onTouchStart?.(event);
      }}
      onPress={onBackgroundPress}
    />
  );
}
