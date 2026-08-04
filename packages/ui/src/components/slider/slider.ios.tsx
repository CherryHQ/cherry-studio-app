import { Host, Slider as ExpoSlider } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as accessibilityLabelModifier,
  disabled as disabledModifier,
} from '@expo/ui/swift-ui/modifiers';
import { useUniwind } from 'uniwind';

import type { SliderProps } from './slider.types';

export function Slider({
  accessibilityLabel,
  disabled = false,
  max = 100,
  min = 0,
  onValueChange,
  step = 1,
  style,
  testID,
  value,
}: SliderProps) {
  const { theme } = useUniwind();

  return (
    <Host
      colorScheme={theme === 'dark' ? 'dark' : 'light'}
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
