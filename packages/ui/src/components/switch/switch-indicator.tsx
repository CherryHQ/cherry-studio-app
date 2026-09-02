import type { StyleProp, ViewStyle } from 'react-native';

import { SwitchVisual } from './switch-visual';
import type { SwitchSize } from './switch.types';

type SwitchIndicatorProps = {
  disabled?: boolean;
  size?: SwitchSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: boolean;
};

export function SwitchIndicator(props: SwitchIndicatorProps) {
  return (
    <SwitchVisual
      {...props}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    />
  );
}
