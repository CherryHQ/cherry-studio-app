import type { AccessibilityProps, StyleProp, ViewProps, ViewStyle } from 'react-native';

import type { SwitchSize } from './switch.types';

export type SwitchControlProps = {
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
