import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import type { DevicePermissionScope, PermissionStatuses } from '@/shared/contracts';

/**
 * Current OS permission state for the given scopes.
 *
 * Refreshed on focus and on foreground because the user can grant or revoke
 * access in system Settings while the app is backgrounded, and a stale
 * "granted" would offer a capability that no longer works.
 *
 * `scopes` must be stable across renders; an inline array literal would
 * re-subscribe every render.
 */
export function useDevicePermissionStatuses(scopes: readonly DevicePermissionScope[]) {
  const permissions = useBackendModule('permissions');
  const [statuses, setStatuses] = useState<PermissionStatuses>({});
  const refreshVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const nextStatuses = await permissions
      .getStatuses(scopes)
      .catch(
        () =>
          Object.fromEntries(
            scopes.map((scope) => [scope, { state: 'error', canAskAgain: false }]),
          ) as PermissionStatuses,
      );
    if (version === refreshVersion.current) setStatuses(nextStatuses);
  }, [permissions, scopes]);

  useFocusEffect(
    useCallback(() => {
      void refresh();

      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void refresh();
        }
      });

      return () => {
        refreshVersion.current++;
        subscription.remove();
      };
    }, [refresh]),
  );

  return { refresh, statuses };
}
