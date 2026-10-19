import type { HealthDataReaderLoader } from '@/backend/services/device';
import type { PermissionStatuses, PermissionsModule } from '@/shared/contracts';

import { createHealthDataTools } from '../healthDataTools';

jest.mock('@/backend/services/device', () =>
  jest.requireActual('@/backend/services/device/healthData'),
);

const queryInput = {
  type: 'bloodPressure',
  mode: 'samples',
  granularity: 'summary',
  startDate: '2026-09-01T00:00:00Z',
  endDate: '2026-09-02T00:00:00Z',
  limit: 10,
  cursor: '',
  workoutId: '',
  reselectRecords: false,
};
const requested = { state: 'requested', canAskAgain: false } as const;

function setup(statuses: PermissionStatuses) {
  const permissions = {
    getStatuses: jest.fn(async () => statuses),
    request: jest.fn(async () => ({})),
  } satisfies Pick<PermissionsModule, 'getStatuses' | 'request'>;
  const reader = {
    getTypeAvailability: jest.fn(async () => ({})),
    query: jest.fn(async () => ({ data: [] })),
  };
  const load = jest.fn(
    async () => reader,
  ) as unknown as jest.MockedFunction<HealthDataReaderLoader>;
  const tools = createHealthDataTools({ devicePermissions: permissions }, load);
  return {
    permissions,
    reader,
    load,
    execute: (index: number, input: Record<string, unknown>) =>
      tools[index]!.execute({
        input,
        signal: new AbortController().signal,
        toolCallId: 'health-data-1',
        turnId: 'turn-1',
      }),
  };
}

describe('extended health read boundaries', () => {
  test('blood pressure requires both constituent quantities and workout filtering adds its own scope', async () => {
    const { execute, permissions, reader } = setup({
      'health.bloodPressureSystolic.read': requested,
      'health.bloodPressureDiastolic.read': requested,
      'health.workouts.read': requested,
    });
    await execute(1, { ...queryInput, workoutId: '9ad2c15e-7e75-4c70-a34f-f24a91a8a261' });
    expect(permissions.getStatuses).toHaveBeenCalledWith([
      'health.bloodPressureSystolic.read',
      'health.bloodPressureDiastolic.read',
      'health.workouts.read',
    ]);
    expect(reader.query).toHaveBeenCalledTimes(1);
    expect(permissions.request).not.toHaveBeenCalled();
  });

  test('one denied blood-pressure constituent prevents reading the correlation', async () => {
    const { execute, load } = setup({
      'health.bloodPressureSystolic.read': requested,
      'health.bloodPressureDiastolic.read': { state: 'denied', canAskAgain: false },
    });
    const result = await execute(1, queryInput);
    expect(result.value).toMatchObject({ status: 'error', retryable: false });
    expect(load).not.toHaveBeenCalled();
  });

  test('catalog discovery never requests personal data access', async () => {
    const { execute, permissions, reader } = setup({});
    const result = await execute(0, { query: 'sleep', kind: 'all', offset: 0, limit: 50 });
    expect(result.value).toMatchObject({
      data: expect.arrayContaining([expect.objectContaining({ type: 'sleep' })]),
    });
    expect(permissions.getStatuses).toHaveBeenCalledWith([]);
    expect(permissions.request).not.toHaveBeenCalled();
    expect(reader.query).not.toHaveBeenCalled();
  });

  test('rejects names outside the catalog before any permission lookup', async () => {
    const { execute, permissions, load } = setup({});
    const result = await execute(1, { ...queryInput, type: 'sleepScore' });
    expect(result.value).toMatchObject({ status: 'error' });
    expect(permissions.getStatuses).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
});
