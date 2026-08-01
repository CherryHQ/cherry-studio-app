import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useBackendModule } from '@/frontend/data';
import type { SystemPermissionState } from '@/shared/contracts';
import type { PermissionPreferenceKey } from '@cherrystudio/shared/data/preference';

import { permissionConfig, permissionKinds } from '../permissionConfig';

export type PermissionSystemStatuses = Partial<
  Record<PermissionPreferenceKey, SystemPermissionState>
>;

export function usePermissionSystemStatuses() {
  const permissions = useBackendModule('permissions');
  const [statuses, setStatuses] = useState<PermissionSystemStatuses>({});

  const refresh = useCallback(async () => {
    const keys = permissionKinds.flatMap((kind) => {
      const config = permissionConfig[kind];
      return config.writeKey ? [config.readKey, config.writeKey] : [config.readKey];
    });
    const nextStatuses = await permissions.getStatuses(keys);
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
