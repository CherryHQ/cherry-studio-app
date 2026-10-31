import type { ReactNode } from 'react';
import { View } from 'react-native';

import { InfoPopover } from '../info-popover';
import { useLockedAppearance } from './locked-context';

/**
 * The press target of a locked component: pressing it explains who owns the value. Without a
 * reason there is nothing to explain, so the content renders inert.
 */
export function LockedTrigger({
  accessibilityLabel,
  children,
  testID,
}: {
  accessibilityLabel?: string;
  children: ReactNode;
  testID?: string;
}) {
  const { reason } = useLockedAppearance();
  if (!reason) {
    return (
      <View accessibilityLabel={accessibilityLabel} accessible testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <InfoPopover
      accessibilityLabel={[accessibilityLabel, reason].filter(Boolean).join(', ')}
      testID={testID}
      text={reason}
    >
      {children}
    </InfoPopover>
  );
}
