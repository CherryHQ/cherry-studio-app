import { View } from 'react-native';

import { HeaderAction } from '../HeaderAction';
import type { HeaderActionTone } from '../HeaderAction';
import type { HeaderActionGroupProps } from './HeaderActionGroup.types';

const GROUP_BASE_CLASS_NAME = 'flex-row items-center gap-1 rounded-full shadow-sm';
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
    <View className={GROUP_CLASS_NAMES[tone]}>
      {actions.map((action) => (
        <HeaderAction action={action} key={action.key} tone={tone} />
      ))}
    </View>
  );
}
