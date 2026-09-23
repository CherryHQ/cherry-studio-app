import { BackgroundPressArea } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';

import {
  useComposerPresentationActions,
  useComposerPresentationState,
} from '../context/ComposerProvider';

/** Recognition belongs to CherryUI; only the composer decides how editing ends. */
export function ComposerDismissArea({
  children,
  disabled,
  testID,
}: PropsWithChildren<{ disabled?: boolean; testID?: string }>) {
  const { dismissInput } = useComposerPresentationActions();
  const { isEditing } = useComposerPresentationState();

  return (
    <BackgroundPressArea
      className="flex-1"
      disabled={disabled || !isEditing}
      onPress={dismissInput}
      testID={testID}
    >
      {children}
    </BackgroundPressArea>
  );
}
