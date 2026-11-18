import { useAlert } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardController } from 'react-native-keyboard-controller';

import { useBackendModule } from '@/frontend/data';
import type { UuRemoteTarget, UuRemoteWindowMode } from '@/shared/contracts/uuRemote';

import { useUuRemoteFeedback } from './useUuRemoteFeedback';

export function useUuRemoteAction(prepare?: (signal: AbortSignal) => Promise<boolean>) {
  const uuRemote = useBackendModule('uuRemote');
  const { alert } = useAlert();
  const { t } = useTranslation();
  const showError = useUuRemoteFeedback();
  const opening = useRef<AbortController | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  useEffect(() => () => opening.current?.abort(), []);

  function reportError(error: unknown, target?: UuRemoteTarget) {
    showError(error, target ? () => open(target, 'fullscreen') : undefined);
  }

  async function run(target: UuRemoteTarget, operation: () => Promise<unknown>) {
    if (opening.current) return;
    const controller = new AbortController();
    opening.current = controller;
    setIsOpening(true);
    try {
      if (prepare && !(await prepare(controller.signal))) return;
      if (controller.signal.aborted) return;
      await KeyboardController.dismiss();
      if (controller.signal.aborted) return;
      await operation();
    } catch (error) {
      if (!controller.signal.aborted) reportError(error, target);
    } finally {
      opening.current = null;
      if (!controller.signal.aborted) setIsOpening(false);
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
