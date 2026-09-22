import { use, useCallback, useState } from 'react';
import type { ViewProps } from 'react-native';

import { ScrollInteractionObserverContext } from '../scroll-interaction/scroll-interaction-context';
import { BackgroundPressAdapter } from './background-press-adapter';
import { BackgroundPressContext } from './background-press-context';
import { createBackgroundPressInteraction } from './background-press-interaction';
import type { BackgroundPressAreaProps } from './background-press.types';

const ignorePress = () => {};

/** Native recognition never claims the list's JS responder or intercepts child touches. */
export function BackgroundPressArea({
  disabled = false,
  onPress,
  ...props
}: BackgroundPressAreaProps) {
  const [interaction] = useState(createBackgroundPressInteraction);
  const handlePress = useCallback(() => {
    if (interaction.commitPress() && !disabled) onPress();
  }, [disabled, interaction, onPress]);

  return (
    <BackgroundPressContext value={interaction}>
      <ScrollInteractionObserverContext value={interaction.observeScroll}>
        <BackgroundPressAdapter
          {...props}
          accessible={false}
          enabled={!disabled}
          mode="background"
          onBackgroundTouchStart={interaction.beginTouch}
          onBackgroundPress={handlePress}
        />
      </ScrollInteractionObserverContext>
    </BackgroundPressContext>
  );
}

/** Content with its own taps, selection or menus is not a background target. */
export function BackgroundPressExclusion({ onTouchStart, ...props }: ViewProps) {
  const interaction = use(BackgroundPressContext);
  return (
    <BackgroundPressAdapter
      {...props}
      accessible={false}
      enabled={false}
      mode="exclusion"
      onBackgroundTouchStart={ignorePress}
      onBackgroundPress={ignorePress}
      onTouchStart={(event) => {
        interaction?.excludeTouch(event.nativeEvent);
        onTouchStart?.(event);
      }}
    />
  );
}
