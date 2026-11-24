import {
  Composer,
  type ComposerDockProps as CherryComposerDockProps,
  getComposerBottomPadding,
} from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavigationDockClearance } from '@/frontend/appShell/navigationShell/state';

import { useComposerPresentationState } from '../context/ComposerProvider';

type ComposerDockProps = Omit<CherryComposerDockProps, 'keyboardTracking'>;

/** Connects CherryUI's dock motion to this composer's input lifecycle. */
export function ComposerDock(props: ComposerDockProps) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { keyboardTracking } = useComposerPresentationState();
  const dockClearance = useNavigationDockClearance();
  const extraBottomOffset =
    dockClearance > 0 ? Math.max(0, bottom + dockClearance - getComposerBottomPadding(bottom)) : 0;

  return (
    <Composer.Dock
      collapseLabel={t('chat.input.action.collapseEditor')}
      extraBottomOffset={extraBottomOffset}
      {...props}
      keyboardTracking={keyboardTracking}
    />
  );
}
