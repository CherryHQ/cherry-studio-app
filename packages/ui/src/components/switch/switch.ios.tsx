import { Host, Toggle } from '@expo/ui/swift-ui';
import {
  accessibilityLabel as accessibilityLabelModifier,
  controlSize,
  disabled as disabledModifier,
  labelsHidden,
} from '@expo/ui/swift-ui/modifiers';
import { useUniwind } from 'uniwind';

import type { SwitchProps, SwitchSize } from './switch.types';

const controlSizes: Record<SwitchSize, 'large' | 'regular' | 'small'> = {
  default: 'regular',
  lg: 'large',
  sm: 'small',
};

export function Switch({
  accessibilityLabel,
  disabled = false,
  onValueChange,
  size = 'default',
  style,
  testID,
  value,
}: SwitchProps) {
  const { theme } = useUniwind();

  return (
    <Host
      colorScheme={theme === 'dark' ? 'dark' : 'light'}
      ignoreSafeArea="all"
      matchContents
      style={style}
      testID={testID ? `${testID}-host` : undefined}
    >
      <Toggle
        isOn={value}
        label={accessibilityLabel}
        modifiers={[
          labelsHidden(),
          controlSize(controlSizes[size]),
          accessibilityLabelModifier(accessibilityLabel),
          disabledModifier(disabled),
        ]}
        onIsOnChange={onValueChange}
        testID={testID}
      />
    </Host>
  );
}
