import { type StyleProp, View, type ViewStyle } from 'react-native';

import { SwitchControl } from './switch-control';
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
    <View accessible={false} pointerEvents="none">
      <SwitchControl
        {...props}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      />
    </View>
  );
}
