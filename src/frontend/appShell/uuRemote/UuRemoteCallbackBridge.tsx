import { useQueryClient } from '@tanstack/react-query';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useRef } from 'react';

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
  const binding = useRef<Extract<UuRemoteResult, { outcome: 'bound' }> | null>(null);

  function continueBinding() {
    const result = binding.current;
    if (!result || coverVisible) return;
    binding.current = null;
    void open(result.target, result.mode);
  }

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
      if (result?.outcome === 'bound') {
        binding.current = result;
        continueBinding();
      } else if (result?.outcome === 'failed')
        reportError(new UuRemoteError(result.reason), result.target);
    },
    onError(error, initial) {
      if (initial) router.replace('/');
      reportError(error);
    },
  });

  const openBinding = useEffectEvent(continueBinding);
  useEffect(() => {
    openBinding();
  }, [coverVisible]);

  return null;
}
