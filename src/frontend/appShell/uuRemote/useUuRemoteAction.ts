import { useAlert } from '@cherrystudio/ui/components';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import type { UuRemoteTarget, UuRemoteWindowMode } from '@/shared/contracts/uuRemote';

import { useUuRemoteFeedback } from './useUuRemoteFeedback';

export function useUuRemoteAction() {
  const uuRemote = useBackendModule('uuRemote');
  const { alert } = useAlert();
  const { t } = useTranslation();
  const showError = useUuRemoteFeedback();
  const opening = useRef(false);
  const [isOpening, setIsOpening] = useState(false);

  function reportError(error: unknown, target?: UuRemoteTarget) {
    showError(error, target ? () => open(target, 'fullscreen') : undefined);
  }

  async function run(target: UuRemoteTarget, operation: () => Promise<unknown>) {
    if (opening.current) return;
    opening.current = true;
    setIsOpening(true);
    Keyboard.dismiss();
    try {
      await operation();
    } catch (error) {
      reportError(error, target);
    } finally {
      opening.current = false;
      setIsOpening(false);
    }
  }

  function bind(target: UuRemoteTarget, mode: UuRemoteWindowMode = 'pip') {
    alert.confirm({
      title: t('uuRemote.bind.title'),
      description: t('uuRemote.bind.description'),
      confirmLabel: t('uuRemote.bind.action'),
      onConfirm: () => run(target, () => uuRemote.bind(target, mode)),
    });
  }

  function open(target: UuRemoteTarget, mode: UuRemoteWindowMode = 'pip') {
    return run(target, async () => {
      if ((await uuRemote.open(target, mode)) === 'binding-required') bind(target, mode);
    });
  }

  return { open, bind, isOpening, reportError };
}
