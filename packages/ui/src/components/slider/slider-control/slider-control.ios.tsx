import { Host, Slider as ExpoSlider } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as accessibilityLabelModifier,
  disabled as disabledModifier,
} from '@expo/ui/swift-ui/modifiers';
import { useUniwind } from 'uniwind';

import type { SliderControlProps } from './slider-control.types';

export function SliderControl({
  accessibilityLabel,
  disabled = false,
  max = 100,
  min = 0,
  onValueChange,
  step = 1,
  style,
  testID,
  value,
}: SliderControlProps) {
  const { theme } = useUniwind();

  return (
    <Host
      colorScheme={theme === 'dark' ? 'dark' : 'light'}
      ignoreSafeArea="all"
      matchContents={{ vertical: true }}
      style={[{ alignSelf: 'stretch' }, style]}
    >
      <ExpoSlider
        max={max}
        min={min}
        modifiers={[accessibilityLabelModifier(accessibilityLabel), disabledModifier(disabled)]}
        onValueChange={onValueChange}
        step={step}
        testID={testID}
        value={value}
      />
    </Host>
  );
}
