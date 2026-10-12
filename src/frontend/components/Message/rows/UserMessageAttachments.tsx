import { BackgroundPressExclusion, ContextMenuExclusion } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

/** Attached files sit above the user's bubble. */
export function UserMessageAttachments({ children }: PropsWithChildren) {
  return (
    <ContextMenuExclusion className="w-full self-end">
      <BackgroundPressExclusion>
        <View className="w-full flex-row flex-wrap justify-end gap-2">{children}</View>
      </BackgroundPressExclusion>
    </ContextMenuExclusion>
  );
}
