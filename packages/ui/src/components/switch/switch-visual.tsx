import { Switch as HeroSwitch } from 'heroui-native';
import type { AccessibilityProps, StyleProp, ViewProps, ViewStyle } from 'react-native';

import type { SwitchSize } from './switch.types';

type SwitchVisualProps = {
  accessibilityElementsHidden?: boolean;
  accessibilityLabel?: string;
  disabled?: boolean;
  importantForAccessibility?: AccessibilityProps['importantForAccessibility'];
  onValueChange?: (value: boolean) => void;
  pointerEvents?: ViewProps['pointerEvents'];
  size?: SwitchSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: boolean;
};

const sizeStyles: Record<SwitchSize, { root: string; thumb: string }> = {
  default: { root: 'h-6 w-12', thumb: 'h-5 w-7' },
  lg: { root: 'h-7 w-14', thumb: 'h-6 w-8' },
  sm: { root: 'h-5 w-10', thumb: 'h-4 w-6' },
};

export function SwitchVisual({
  accessibilityElementsHidden,
  accessibilityLabel,
  disabled = false,
  importantForAccessibility,
  onValueChange,
  pointerEvents,
  size = 'default',
  style,
  testID,
  value,
}: SwitchVisualProps) {
  return (
    <HeroSwitch
      accessibilityElementsHidden={accessibilityElementsHidden}
      accessibilityLabel={accessibilityLabel}
      className={sizeStyles[size].root}
      hitSlop={8}
      importantForAccessibility={importantForAccessibility}
      isDisabled={disabled}
      isSelected={value}
      onSelectedChange={onValueChange}
      pointerEvents={pointerEvents}
      style={style}
      testID={testID}
    >
      <HeroSwitch.Thumb className={sizeStyles[size].thumb} />
    </HeroSwitch>
  );
}
