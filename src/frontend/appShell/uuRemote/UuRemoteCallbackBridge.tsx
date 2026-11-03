import { useQueryClient } from '@tanstack/react-query';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';

import { remoteChatHref } from '@/frontend/appShell/navigation/chat';
import { useStartupCoverVisible } from '@/frontend/appShell/startup';
import { queryKeys, useBackendModule } from '@/frontend/data';
import { UuRemoteError, type UuRemoteResult } from '@/shared/contracts/uuRemote';

import { useUuRemoteAction } from './useUuRemoteAction';
import { useUuRemoteCallbacks } from './useUuRemoteCallbacks';

/** Warm callbacks leave the mounted page intact. Only a cold start restores a saved target. */
export function UuRemoteCallbackBridge() {
  const module = useBackendModule('uuRemote');
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigation = useRootNavigationState();
  const coverVisible = useStartupCoverVisible();
  const { open, reportError } = useUuRemoteAction();
  const [binding, setBinding] = useState<Extract<UuRemoteResult, { outcome: 'bound' }> | null>(
    null,
  );

  useUuRemoteCallbacks({
    module,
    isReady: Boolean(navigation?.key),
    onResult(result, initial) {
      if (initial) {
        const target = result?.target;
        router.replace(
          !target
            ? '/'
            : target.page === 'device'
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
      }
      if (
        result?.outcome === 'bound' ||
        (result?.outcome === 'failed' && result.reason === 'binding-invalid')
      ) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.uuRemote.binding(result.target.connectionId),
        });
      }
      if (result?.outcome === 'bound') setBinding(result);
      else if (result?.outcome === 'failed')
        reportError(new UuRemoteError(result.reason), result.target);
    },
    onError(error, initial) {
      if (initial) router.replace('/');
      reportError(error);
    },
  });

  const openBinding = useEffectEvent(open);
  useEffect(() => {
    if (!binding || coverVisible) return;
    setBinding(null);
    void openBinding(binding.target, binding.mode);
  }, [binding, coverVisible]);

  return null;
}
