import type { PermissionsModule } from '@/shared/contracts';

import {
  createPermissionsModule,
  type PermissionsModuleDependencies,
} from '../createPermissionsModule';

function createSubject() {
  const dependencies: PermissionsModuleDependencies = {
    device: {
      getStatus: jest.fn(async () => 'undetermined'),
      openSystemSettings: jest.fn(async () => undefined),
      request: jest.fn(async () => 'granted'),
    },
  };
  const backend: PermissionsModule = createPermissionsModule(dependencies);
  return { backend, dependencies };
}

describe('createPermissionsModule', () => {
  it('reads each requested system permission scope once', async () => {
    const { backend, dependencies } = createSubject();

    await expect(backend.getStatuses(['calendar.read', 'calendar.read'])).resolves.toEqual({
      'calendar.read': 'undetermined',
    });
    expect(dependencies.device.getStatus).toHaveBeenCalledTimes(1);
  });

  it('delegates an in-context system permission request', async () => {
    const { backend, dependencies } = createSubject();

    await expect(backend.request('location.read')).resolves.toBe('granted');
    expect(dependencies.device.request).toHaveBeenCalledWith('location.read');
  });

  it('opens the app system settings for the requested permission kind', async () => {
    const { backend, dependencies } = createSubject();

    await backend.openSystemSettings('health');

    expect(dependencies.device.openSystemSettings).toHaveBeenCalledWith('health');
  });
});
