import {
  Composer,
  type ComposerDockProps as CherryComposerDockProps,
} from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { useNavigationDockClearance } from '@/frontend/appShell/navigationShell/state';

import { useComposerPresentationState } from '../context/ComposerProvider';

type ComposerDockProps = Omit<CherryComposerDockProps, 'keyboardTracking'>;

/** Connects CherryUI's dock motion to this composer's input lifecycle. */
export function ComposerDock(props: ComposerDockProps) {
  const { t } = useTranslation();
  const { keyboardTracking } = useComposerPresentationState();
  const dockClearance = useNavigationDockClearance();

  return (
    <Composer.Dock
      collapseLabel={t('chat.input.action.collapseEditor')}
      extraBottomOffset={dockClearance}
      {...props}
      keyboardTracking={keyboardTracking}
    />
  );
}
