import { clearInitialURL, getLinkingURL } from 'expo-linking';
import { useEffect, useEffectEvent, useSyncExternalStore } from 'react';

import type { UuRemoteModule, UuRemoteResult } from '@/shared/contracts/uuRemote';

import { uuRemoteCallbacks } from './nativeIntent';

export function useUuRemoteCallbacks({
  module,
  isReady,
  onResult,
  onError,
}: {
  module: UuRemoteModule;
  isReady: boolean;
  onResult(result: UuRemoteResult | null, initial: boolean): void;
  onError(error: unknown, initial: boolean): void;
}) {
  const callback = useSyncExternalStore(
    uuRemoteCallbacks.subscribe,
    uuRemoteCallbacks.getSnapshot,
    uuRemoteCallbacks.getSnapshot,
  );
  const receiveResult = useEffectEvent(onResult);
  const receiveError = useEffectEvent(onError);

  useEffect(() => {
    if (!isReady || !callback) return;
    let active = true;
    // Preserve one-shot validation across effect resubscriptions and shell remounts.
    callback.result ??= module.receiveCallback(callback.url);
    void callback.result
      .then((result) => {
        if (active) receiveResult(result, callback.initial);
      })
      .catch((error: unknown) => {
        if (active) receiveError(error, callback.initial);
      })
      .finally(() => {
        if (!active) return;
        if (getLinkingURL() === callback.url) clearInitialURL();
        uuRemoteCallbacks.consume(callback);
      });
    return () => {
      active = false;
    };
  }, [callback, isReady, module]);
}
