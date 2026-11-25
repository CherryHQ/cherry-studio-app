import {
  Composer,
  type ComposerDockProps as CherryComposerDockProps,
} from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavigationDockClearance } from '@/frontend/appShell/navigationShell/state';

import { useComposerPresentationState } from '../context/ComposerProvider';
import { getComposerExtraBottomOffset } from '../utils/composerDockOffset';

type ComposerDockProps = Omit<CherryComposerDockProps, 'keyboardTracking'>;

/** Connects CherryUI's dock motion to this composer's input lifecycle. */
export function ComposerDock(props: ComposerDockProps) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { keyboardTracking } = useComposerPresentationState();
  const dockClearance = useNavigationDockClearance();
  const extraBottomOffset = getComposerExtraBottomOffset(bottom, dockClearance);

  return (
    <Composer.Dock
      collapseLabel={t('chat.input.action.collapseEditor')}
      extraBottomOffset={extraBottomOffset}
      {...props}
      keyboardTracking={keyboardTracking}
    />
  );
}
