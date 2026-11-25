import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { useSidebarPresence } from './useSidebarPresence';

/** Keep the same demand across selecting its target, until the route can retain the connection. */
export function useSidebarDesktopPrewarm(
  connections: readonly DesktopConnection[],
  view: 'agents' | 'sessions',
  currentId?: string,
) {
  const remoteAgent = useBackendModule('remoteAgent');
  const active = useSidebarPresence() === 'open';
  const [lastDevice, setLastDevice] = useState(currentId);
  if (currentId && currentId !== lastDevice) setLastDevice(currentId);
  const eligible = connections.filter(
    (device) => device.status === 'paired' && device.capabilities.includes('agent'),
  );
  const target =
    eligible.find((device) => device.id === (currentId ?? lastDevice)) ??
    (!currentId && eligible.length === 1 ? eligible[0] : undefined);
  const id = target?.id;

  useEffect(() => {
    if (!active || !id) return;
    let attempt: AbortController | undefined;
    const start = () => {
      if (attempt) return;
      attempt = new AbortController();
      // The selected route owns actionable connection failures. Simply opening a drawer is silent.
      void remoteAgent.prewarm(id, view, attempt.signal).catch(() => undefined);
    };
    const stop = () => {
      attempt?.abort();
      attempt = undefined;
    };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') stop();
      else if (state === 'active') start();
    });
    return () => {
      subscription.remove();
      stop();
    };
  }, [active, id, remoteAgent, view]);
}
