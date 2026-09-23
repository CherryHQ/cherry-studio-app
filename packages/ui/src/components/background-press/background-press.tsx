import { useCallback } from 'react';
import type { ViewProps } from 'react-native';

import { BackgroundPressAdapter } from './background-press-adapter';
import type { BackgroundPressAreaProps } from './background-press.types';

const ignorePress = () => {};

/**
 * Native recognition owns the press decision: scrolling, momentum stops, exclusions and nested
 * areas cancel it on the UI thread. It never claims the list's JS responder.
 */
export function BackgroundPressArea({
  disabled = false,
  onPress,
  ...props
}: BackgroundPressAreaProps) {
  const handlePress = useCallback(() => {
    if (!disabled) onPress();
  }, [disabled, onPress]);

  return (
    <BackgroundPressAdapter
      {...props}
      accessible={false}
      enabled={!disabled}
      mode="background"
      onBackgroundPress={handlePress}
    />
  );
}

/** A control with its own taps, menus or scrolling is not a background target. */
export function BackgroundPressExclusion(props: ViewProps) {
  return (
    <BackgroundPressAdapter
      {...props}
      accessible={false}
      enabled={false}
      mode="exclusion"
      onBackgroundPress={ignorePress}
    />
  );
}
