import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import type { PermissionStatuses } from '@/shared/contracts';

import { permissionConfig, permissionKinds } from '../permissionConfig';

export function usePermissionSystemStatuses() {
  const permissions = useBackendModule('permissions');
  const [statuses, setStatuses] = useState<PermissionStatuses>({});

  const refresh = useCallback(async () => {
    const scopes = permissionKinds.flatMap((kind) => permissionConfig[kind].scopes);
    const nextStatuses = await permissions.getStatuses(scopes);
    setStatuses((current) => ({ ...current, ...nextStatuses }));
  }, [permissions]);

  useFocusEffect(
    useCallback(() => {
      void refresh();

      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void refresh();
        }
      });

      return () => subscription.remove();
    }, [refresh]),
  );

  return { refresh, statuses };
}
