import type {
  DevicePermission,
  DevicePermissionScope,
  PermissionStatuses,
  PermissionsModule,
  SystemPermissionState,
} from '@/shared/contracts';

type PermissionDevice = {
  getStatus(scope: DevicePermissionScope): Promise<SystemPermissionState>;
  openSystemSettings(permission?: DevicePermission): Promise<void>;
  request(scope: DevicePermissionScope): Promise<SystemPermissionState>;
};

export type PermissionsModuleDependencies = {
  device: PermissionDevice;
};

export function createPermissionsModule(
  dependencies: PermissionsModuleDependencies,
): PermissionsModule {
  const getStatuses = async (
    scopes: readonly DevicePermissionScope[],
  ): Promise<PermissionStatuses> => {
    const entries = await Promise.all(
      unique(scopes).map(
        async (scope) => [scope, await dependencies.device.getStatus(scope)] as const,
      ),
    );
    return Object.fromEntries(entries);
  };

  const openSystemSettings = (permission?: DevicePermission): Promise<void> =>
    dependencies.device.openSystemSettings(permission);

  return {
    getStatuses,
    openSystemSettings,
    request: (scope) => dependencies.device.request(scope),
  };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
