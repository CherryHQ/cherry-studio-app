import { Host, Toggle } from '@expo/ui/swift-ui';
import {
  accessibilityHidden,
  accessibilityLabel as accessibilityLabelModifier,
  controlSize,
  disabled as disabledModifier,
  labelsHidden,
} from '@expo/ui/swift-ui/modifiers';
import { useUniwind } from 'uniwind';

import type { SwitchControlProps } from './switch-control.types';
import type { SwitchSize } from './switch.types';

const controlSizes: Record<SwitchSize, 'large' | 'regular' | 'small'> = {
  default: 'regular',
  lg: 'large',
  sm: 'small',
};

export function SwitchControl({
  accessibilityElementsHidden = false,
  accessibilityLabel,
  disabled = false,
  onValueChange,
  pointerEvents,
  size = 'default',
  style,
  testID,
  value,
}: SwitchControlProps) {
  const { theme } = useUniwind();
  const accessibilityModifier = accessibilityElementsHidden
    ? accessibilityHidden()
    : accessibilityLabel
      ? accessibilityLabelModifier(accessibilityLabel)
      : undefined;

  return (
    <Host
      colorScheme={theme === 'dark' ? 'dark' : 'light'}
      ignoreSafeArea="all"
      matchContents
      pointerEvents={pointerEvents}
      style={style}
      testID={testID ? `${testID}-host` : undefined}
    >
      <Toggle
        isOn={value}
        label={accessibilityLabel ?? ''}
        modifiers={[
          labelsHidden(),
          controlSize(controlSizes[size]),
          ...(accessibilityModifier ? [accessibilityModifier] : []),
          disabledModifier(disabled),
        ]}
        onIsOnChange={onValueChange}
        testID={testID}
      />
    </Host>
  );
}
