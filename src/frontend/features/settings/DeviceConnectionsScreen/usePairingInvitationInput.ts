import * as Clipboard from 'expo-clipboard';
import { useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { DesktopPairingQr } from '@/shared/data/api/schemas/desktopConnections';

import { parseDesktopPairingCode } from './parseDesktopPairingCode';

/** Camera scans and pasted invitations share one submission; an invalid scan never blocks paste. */
export function usePairingInvitationInput({
  canSubmit,
  onInvitation,
  onInvalidPaste,
}: {
  canSubmit: () => boolean;
  onInvitation: (invitation: DesktopPairingQr) => void;
  onInvalidPaste: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [scanInvalid, setScanInvalid] = useState(false);
  const inFlight = useRef(false);

  const submit = (invitation: DesktopPairingQr) => {
    if (!canSubmit() || inFlight.current) return;
    inFlight.current = true;
    setSubmitted(true);
    onInvitation(invitation);
  };

  // An invalid scan only pauses the camera until retry.
  const scan = (value: string) => {
    if (!canSubmit() || inFlight.current) return;
    const invitation = parseDesktopPairingCode(value);
    if (invitation) submit(invitation);
    else setScanInvalid(true);
  };

  const paste = async () => {
    const invitation = parseDesktopPairingCode(await Clipboard.getStringAsync().catch(() => ''));
    if (invitation) {
      // iOS's paste consent alert leaves the app inactive when the read resolves.
      if (AppState.currentState !== 'active')
        await new Promise<void>((resolve) => {
          const subscription = AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            subscription.remove();
            resolve();
          });
        });
      submit(invitation);
    } else onInvalidPaste();
  };

  return { submitted, scanInvalid, scan, paste, retryScan: () => setScanInvalid(false) };
}
