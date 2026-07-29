import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import type { PreferenceAppKeyType } from '@/data/preference';
import { useDataServices } from '@/data/runtime';
import type { SystemPermissionState } from '@/services/devicePermissions';

import { permissionConfig, permissionKinds } from './permissionConfig';

export type PermissionSystemStatuses = Partial<Record<PreferenceAppKeyType, SystemPermissionState>>;

export function usePermissionSystemStatuses() {
  const service = useDataServices().devicePermission;
  const [statuses, setStatuses] = useState<PermissionSystemStatuses>({});

  const refresh = useCallback(async () => {
    const keys = permissionKinds.flatMap((kind) => {
      const config = permissionConfig[kind];
      return config.writeKey ? [config.readKey, config.writeKey] : [config.readKey];
    });
    const results = await Promise.all(
      keys.map(async (key) => [key, await service.getStatusForPreference(key)] as const),
    );
    setStatuses((current) => ({ ...current, ...Object.fromEntries(results) }));
  }, [service]);

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
