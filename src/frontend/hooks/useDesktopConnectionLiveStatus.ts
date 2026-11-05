import { useCallback, useRef, useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data';
import type { DesktopLiveStatus } from '@/shared/contracts/desktopConnections';

export const DEFAULT_LIVE_STATUS: DesktopLiveStatus = Object.freeze({
  state: 'unreachable',
  reason: 'no-location',
});

function areLiveStatusesEqual(a: DesktopLiveStatus, b: DesktopLiveStatus): boolean {
  if (a === b) return true;
  if (a.state !== b.state) return false;
  if (a.state === 'reconnecting' && b.state === 'reconnecting') return a.retry === b.retry;
  if (a.state === 'unreachable' && b.state === 'unreachable') {
    if (a.reason !== b.reason) return false;
    if ((a.failures?.length ?? 0) !== (b.failures?.length ?? 0)) return false;
    return true;
  }
  if (a.state === 'needs-repair' && b.state === 'needs-repair') return a.reason === b.reason;
  if (a.state === 'unsupported' && b.state === 'unsupported') return a.message === b.message;
  return true;
}

export function useDesktopConnectionLiveStatus(
  connectionId: string | undefined,
): DesktopLiveStatus {
  const connections = useBackendModule('desktopConnections');
  const cacheRef = useRef<{ connectionId?: string; status: DesktopLiveStatus }>({
    connectionId,
    status: DEFAULT_LIVE_STATUS,
  });

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!connectionId) return () => {};
      return connections.subscribeConnectionLiveStatus(connectionId, onStoreChange);
    },
    [connections, connectionId],
  );

  const getSnapshot = useCallback((): DesktopLiveStatus => {
    if (!connectionId) return DEFAULT_LIVE_STATUS;
    const next = connections.getConnectionLiveStatus(connectionId);
    if (
      cacheRef.current.connectionId === connectionId &&
      areLiveStatusesEqual(cacheRef.current.status, next)
    ) {
      return cacheRef.current.status;
    }
    cacheRef.current = { connectionId, status: next };
    return next;
  }, [connections, connectionId]);

  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_LIVE_STATUS);
}
