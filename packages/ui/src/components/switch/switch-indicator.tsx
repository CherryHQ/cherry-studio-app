import { type StyleProp, View, type ViewStyle } from 'react-native';

import { LockedSwitchControl } from './locked-switch-control';
import { SwitchControl } from './switch-control/switch-control';
import type { SwitchSize } from './switch.types';

type SwitchIndicatorProps = {
  disabled?: boolean;
  locked?: boolean;
  size?: SwitchSize;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: boolean;
};

export function SwitchIndicator({ locked = false, ...props }: SwitchIndicatorProps) {
  if (locked) return <LockedSwitchControl testID={props.testID} value={props.value} />;
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
