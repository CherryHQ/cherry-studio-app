import MonitorIcon from '@cherrystudio/app-icons/icons/monitor';
import { useAlert } from '@cherrystudio/ui/components';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import type { HeaderToolbarAction } from '@/frontend/appShell/header';
import { useBackendModule } from '@/frontend/data';
import type { UuRemoteTarget } from '@/shared/contracts/uuRemote';

import { useUuRemoteFeedback } from './useUuRemoteFeedback';

export function useUuRemoteAction(target: UuRemoteTarget | undefined) {
  const uuRemote = useBackendModule('uuRemote');
  const { alert } = useAlert();
  const { t } = useTranslation();
  const reportError = useUuRemoteFeedback();
  const opening = useRef(false);
  const [isOpening, setIsOpening] = useState(false);

  async function run(operation: () => Promise<unknown>) {
    if (opening.current) return;
    opening.current = true;
    setIsOpening(true);
    Keyboard.dismiss();
    try {
      await operation();
    } catch (error) {
      reportError(error);
    } finally {
      opening.current = false;
      setIsOpening(false);
    }
  }

  function bind() {
    if (!target) return;
    const destination = target;
    alert.confirm({
      title: t('uuRemote.bind.title'),
      description: t('uuRemote.bind.description'),
      confirmLabel: t('uuRemote.bind.action'),
      onConfirm: () => run(() => uuRemote.bind(destination)),
    });
  }

  const action: HeaderToolbarAction | undefined = target
    ? {
        key: 'uu-remote-desktop',
        type: 'icon',
        icon: MonitorIcon,
        nativeIcon: 'desktopcomputer',
        accessibilityLabel: t('uuRemote.open'),
        disabled: isOpening,
        testID: 'remote-desktop-button',
        onPress: () =>
          void run(async () => {
            if ((await uuRemote.open(target)) === 'binding-required') bind();
          }),
      }
    : undefined;

  return { action, bind, isOpening };
}
