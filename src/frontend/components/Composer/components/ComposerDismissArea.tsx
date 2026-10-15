import { BackgroundPressArea, useComposerExpansion } from '@cherrystudio/ui/components';
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
  const isExpanded = useComposerExpansion()?.state.isPresented ?? false;

  return (
    <BackgroundPressArea
      className="flex-1"
      accessibilityElementsHidden={isExpanded}
      importantForAccessibility={isExpanded ? 'no-hide-descendants' : 'auto'}
      disabled={disabled || !isEditing || isExpanded}
      onPress={dismissInput}
      testID={testID}
    >
      {children}
    </BackgroundPressArea>
  );
}
