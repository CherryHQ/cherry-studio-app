import { View } from 'react-native';

import { cn } from '../../utils';
import { useIsInLockedGroup } from '../locked/locked-context';
import { LockedMark } from '../locked/locked-mark';

/**
 * A switch whose value another party owns. The track drops the action green for a neutral tone;
 * position and track depth still tell on from off. Alone, its thumb carries the owner's mark; inside
 * a locked group the group's header already names the owner. Both platforms draw it, sized like the
 * platform's own switch, because the iOS system switch cannot carry a mark.
 */
export function LockedSwitchControl({ testID, value }: { testID?: string; value: boolean }) {
  const inGroup = useIsInLockedGroup();
  return (
    <View
      accessible={false}
      className={cn(
        'h-6 w-11 justify-center rounded-full p-0.5 ios:h-[31px] ios:w-[51px]',
        value ? 'items-end bg-foreground-tertiary' : 'items-start bg-border-strong',
      )}
      pointerEvents="none"
      testID={testID}
    >
      <View className="size-5 items-center justify-center rounded-full bg-constant-white shadow-sm ios:size-[27px]">
        {inGroup ? null : <LockedMark className="size-3 text-constant-black/60 ios:size-3.5" />}
      </View>
    </View>
  );
}
