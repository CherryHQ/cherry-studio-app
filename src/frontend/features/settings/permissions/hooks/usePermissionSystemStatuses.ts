import { useMemo } from 'react';

import { useDevicePermissionStatuses } from '@/frontend/hooks/useDevicePermissionStatuses';

import { permissionConfig, permissionKinds } from '../permissionConfig';

/** Every scope this screen lists, watched together. */
export function usePermissionSystemStatuses() {
  const scopes = useMemo(
    () => permissionKinds.flatMap((kind) => permissionConfig[kind].scopes),
    [],
  );
  return useDevicePermissionStatuses(scopes);
}
