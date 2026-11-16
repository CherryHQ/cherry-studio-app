import { permissionConfig } from '@/frontend/hooks/devicePermission/permissionConfig';
import { useDevicePermissionStatuses } from '@/frontend/hooks/useDevicePermissionStatuses';

import { visiblePermissionKinds } from '../components/PermissionListPresentation/PermissionListPresentation';

const scopes = visiblePermissionKinds.flatMap((kind) => permissionConfig[kind].scopes);

export function usePermissionSystemStatuses() {
  return useDevicePermissionStatuses(scopes);
}
