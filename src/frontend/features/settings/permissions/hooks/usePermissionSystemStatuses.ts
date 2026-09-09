import { useDevicePermissionStatuses } from '@/frontend/hooks/useDevicePermissionStatuses';

import { visiblePermissionKinds } from '../components/PermissionListPresentation/PermissionListPresentation';
import { permissionConfig } from '../permissionConfig';

const scopes = visiblePermissionKinds.flatMap((kind) => permissionConfig[kind].scopes);

export function usePermissionSystemStatuses() {
  return useDevicePermissionStatuses(scopes);
}
