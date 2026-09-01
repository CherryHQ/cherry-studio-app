import { View } from 'react-native';

import { HeaderAction } from '../HeaderAction';
import type { HeaderActionTone } from '../HeaderAction';
import type { HeaderActionGroupProps } from './HeaderActionGroup';

const GROUP_BASE_CLASS_NAME = 'absolute inset-1 rounded-full shadow-sm';
const GROUP_CLASS_NAMES: Record<HeaderActionTone, string> = {
  default: `${GROUP_BASE_CLASS_NAME} bg-background`,
  inverse: `${GROUP_BASE_CLASS_NAME} bg-constant-black/55`,
};

/** Draws the Android fallback for the shared surface supplied by the iOS native toolbar. */
export function HeaderActionGroup({ actions, tone = 'default' }: HeaderActionGroupProps) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <View className="relative flex-row items-center">
      {/* Actions own adjacent, non-overlapping 48dp targets. The inset surface
          stays 40dp tall and remains a circle when the group has one action. */}
      <View className={GROUP_CLASS_NAMES[tone]} pointerEvents="none" />
      {actions.map((action) => (
        <HeaderAction action={action} key={action.key} targetSize="touch-target" tone={tone} />
      ))}
    </View>
  );
}
