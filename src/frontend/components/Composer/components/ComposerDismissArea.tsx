import type { PropsWithChildren } from 'react';
import { Pressable } from 'react-native';

import { useComposerPresentationActions } from '../context/ComposerProvider';

/** Only a completed background press ends editing; scrolling and child controls can cancel it. */
export function ComposerDismissArea({
  children,
  disabled,
  testID,
}: PropsWithChildren<{ disabled?: boolean; testID?: string }>) {
  const { dismissInput } = useComposerPresentationActions();

  return (
    <Pressable
      accessible={false}
      className="flex-1"
      disabled={disabled}
      onPress={dismissInput}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}
