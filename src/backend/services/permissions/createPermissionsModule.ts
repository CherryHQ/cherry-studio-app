import type { PermissionsModule } from '@/shared/contracts';

export type PermissionsModuleDependencies = { device: PermissionsModule };

export function createPermissionsModule({
  device,
}: PermissionsModuleDependencies): PermissionsModule {
  return {
    getStatuses: (scopes) => device.getStatuses(scopes),
    openSystemSettings: (permission) => device.openSystemSettings(permission),
    request: (scopes) => device.request(scopes),
  };
}
