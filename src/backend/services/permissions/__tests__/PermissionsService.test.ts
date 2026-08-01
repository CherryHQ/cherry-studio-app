import type { PermissionsBackend } from '@/shared/contracts';

import { PermissionsService, type PermissionsServiceDependencies } from '../PermissionsService';

function createSubject() {
  const dependencies: PermissionsServiceDependencies = {
    device: {
      getStatus: jest.fn(async () => 'undetermined'),
      openSystemSettings: jest.fn(async () => undefined),
      request: jest.fn(async () => 'granted'),
    },
    preferences: {
      readCached: jest.fn(() => 'never'),
      set: jest.fn(async () => undefined),
    },
  };
  const backend: PermissionsBackend = new PermissionsService(dependencies);
  return { backend, dependencies };
}

describe('PermissionsService', () => {
  it('requests system access before persisting an enabled policy', async () => {
    const { backend, dependencies } = createSubject();

    await expect(backend.setPolicy('permissions.location_read', 'ask')).resolves.toEqual({
      policy: 'ask',
      status: 'granted',
    });
    expect(dependencies.device.request).toHaveBeenCalledWith('permissions.location_read');
    expect(dependencies.preferences.set).toHaveBeenCalledWith('permissions.location_read', 'ask');
  });

  it('keeps the current policy when system access is denied', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.device.request).mockResolvedValue('denied');

    await expect(backend.setPolicy('permissions.location_read', 'always')).resolves.toEqual({
      policy: 'never',
      status: 'denied',
    });
    expect(dependencies.preferences.set).not.toHaveBeenCalled();
  });

  it('requests undetermined permissions during recovery', async () => {
    const { backend, dependencies } = createSubject();

    await expect(backend.recover(['permissions.calendar_read'])).resolves.toEqual({
      'permissions.calendar_read': 'granted',
    });
    expect(dependencies.device.openSystemSettings).not.toHaveBeenCalled();
  });

  it('opens settings for a previously denied permission', async () => {
    const { backend, dependencies } = createSubject();
    jest.mocked(dependencies.device.getStatus).mockResolvedValue('denied');

    await backend.recover(['permissions.health_read']);

    expect(dependencies.device.openSystemSettings).toHaveBeenCalledWith('health');
  });
});
