import {
  Composer,
  type ComposerDockProps as CherryComposerDockProps,
} from '@cherrystudio/ui/components';

import { useComposerPresentationState } from '../context/ComposerProvider';

type ComposerDockProps = Omit<CherryComposerDockProps, 'keyboardTrackingEnabled'>;

/** Connects CherryUI's dock motion to this composer's input lifecycle. */
export function ComposerDock(props: ComposerDockProps) {
  const { isKeyboardTrackingEnabled } = useComposerPresentationState();

  return <Composer.Dock {...props} keyboardTrackingEnabled={isKeyboardTrackingEnabled} />;
}
