import {
  Composer,
  type ComposerDockProps as CherryComposerDockProps,
} from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { useComposerPresentationState } from '../context/ComposerProvider';

type ComposerDockProps = Omit<CherryComposerDockProps, 'keyboardTracking'>;

/** Connects CherryUI's dock motion to this composer's input lifecycle. */
export function ComposerDock(props: ComposerDockProps) {
  const { t } = useTranslation();
  const { keyboardTracking } = useComposerPresentationState();

  return (
    <Composer.Dock
      collapseLabel={t('chat.input.action.collapseEditor')}
      {...props}
      keyboardTracking={keyboardTracking}
    />
  );
}
