import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';

import {
  parseRemoteChatRoute,
  type RemoteChatRouteParams,
} from '@/frontend/appShell/navigation/chat';
import { useDesktopConnections } from '@/frontend/hooks/useDesktopConnections';

export function useRemoteChatTarget() {
  const params = useLocalSearchParams<RemoteChatRouteParams>();
  const target = useMemo(() => parseRemoteChatRoute(params), [params]);
  const isFocused = useIsFocused();
  const router = useRouter();
  const { connections } = useDesktopConnections();

  useEffect(() => {
    // Global params can still be empty while this route mounts with an explicit desktop.
    // Only the focused page's own params may authorize choosing a default connection.
    if (!isFocused || !target || target.connectionId) return;
    const first = connections.find(
      (connection) =>
        connection.status === 'paired' &&
        connection.capabilities.includes(target.domain ?? 'agent'),
    );
    if (first) router.setParams({ connectionId: first.id });
  }, [connections, isFocused, router, target]);

  return target;
}
