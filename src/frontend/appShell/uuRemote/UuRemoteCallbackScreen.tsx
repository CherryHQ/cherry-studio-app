import { ContentState } from '@cherrystudio/ui/components';
import { clearInitialURL, useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { remoteChatHref } from '@/frontend/appShell/navigation/chat';
import { useBackendModule } from '@/frontend/data';
import { UuRemoteError } from '@/shared/contracts/uuRemote';

import { useUuRemoteFeedback } from './useUuRemoteFeedback';

/** UU owns the PiP window. This route only consumes its one-shot result and restores Cherry. */
export function UuRemoteCallbackScreen() {
  const url = useLinkingURL();
  const uuRemote = useBackendModule('uuRemote');
  const router = useRouter();
  const { t } = useTranslation();
  const reportError = useUuRemoteFeedback();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!url || handled.current === url) return;
    handled.current = url;
    clearInitialURL();
    // Remove the encrypted device ID and nonce from navigation before doing async work.
    if (router.canGoBack()) router.back();
    else router.replace('/');
    void uuRemote
      .receiveCallback(url)
      .then(async (result) => {
        if (!result) return;
        const { target } = result;
        router.dismissTo(
          target.page === 'device'
            ? {
                pathname: '/settings/device-connections/[connectionId]',
                params: { connectionId: target.connectionId },
              }
            : remoteChatHref({
                connectionId: target.connectionId,
                agentId: target.agentId,
                sessionId: target.sessionId,
                draftId: target.draftId,
              }),
        );
        if (result.outcome === 'bound') {
          if ((await uuRemote.open(target)) === 'binding-required')
            throw new UuRemoteError('binding-invalid');
        } else if (result.outcome === 'failed') {
          reportError(new UuRemoteError(result.reason));
        }
      })
      .catch(reportError);
  }, [url, uuRemote, router, reportError]);

  return <ContentState.Loading title={t('uuRemote.returning')} />;
}
