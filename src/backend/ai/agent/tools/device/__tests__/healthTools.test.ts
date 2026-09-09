import type { HealthKit } from 'react-native-nitro-healthkit';

import type { PermissionStatuses, PermissionsModule } from '@/shared/contracts';

import { createHealthTools } from '../healthTools';

jest.mock('@/backend/services/device', () =>
  jest.requireActual('@/backend/services/device/health'),
);

const callInput = {
  startDate: '2026-09-01T00:00:00Z',
  endDate: '2026-09-02T00:00:00Z',
  granularity: 'summary',
};

function setup(statuses: PermissionStatuses, requested: PermissionStatuses = {}) {
  const permissions = {
    getStatuses: jest.fn(async () => statuses),
    request: jest.fn(async () => requested),
  } satisfies Pick<PermissionsModule, 'getStatuses' | 'request'>;
  const native = {
    getQuantityData: jest.fn(async (_identifier: string) => []),
    getAggregatedQuantity: jest.fn(async () => 0),
  };
  const load = jest.fn(async () => native as unknown as HealthKit);
  const [summary] = createHealthTools({ devicePermissions: permissions }, load);
  return {
    permissions,
    native,
    load,
    execute: (metrics: string[]) =>
      summary!.execute({
        input: { ...callInput, metrics },
        signal: new AbortController().signal,
        toolCallId: 'health-1',
      }),
  };
}

describe('health tool permission selection', () => {
  test('requests only the metrics selected by this call', async () => {
    const { execute, permissions, native } = setup(
      {
        'health.steps.read': { state: 'undetermined', canAskAgain: true },
        'health.heartRate.read': { state: 'undetermined', canAskAgain: true },
      },
      { 'health.steps.read': { state: 'granted', canAskAgain: false } },
    );
    await execute(['steps']);
    expect(permissions.getStatuses).toHaveBeenCalledWith(['health.steps.read']);
    expect(permissions.request).toHaveBeenCalledWith(
      ['health.steps.read'],
      expect.any(AbortSignal),
    );
    expect(native.getQuantityData.mock.calls.map(([identifier]) => identifier)).toEqual([
      'HKQuantityTypeIdentifierStepCount',
    ]);
  });

  test('continues with granted metrics after another metric is refused', async () => {
    const { execute, native } = setup(
      {
        'health.steps.read': { state: 'granted', canAskAgain: false },
        'health.heartRate.read': { state: 'undetermined', canAskAgain: true },
      },
      { 'health.heartRate.read': { state: 'denied', canAskAgain: false } },
    );
    const result = await execute(['steps', 'heartRate']);
    expect(result.value).toMatchObject({
      data: { steps: { value: null } },
      unavailableMetrics: ['heartRate'],
      metricStates: { steps: 'no-data' },
    });
    expect(native.getQuantityData).toHaveBeenCalledTimes(1);
  });

  test('an iOS completed request allows an empty query without claiming zero activity', async () => {
    const { execute, permissions } = setup({
      'health.steps.read': { state: 'requested', canAskAgain: false },
    });
    const result = await execute(['steps']);
    expect(result.value).toMatchObject({
      data: { steps: { value: null } },
      metricStates: { steps: 'no-data' },
      unavailableMetrics: [],
      accessNote: expect.stringContaining('does not disclose read denials'),
    });
    expect(permissions.request).not.toHaveBeenCalled();
  });

  test('another granted metric does not authorize the selected denied metric', async () => {
    const { execute, load } = setup({
      'health.steps.read': { state: 'granted', canAskAgain: false },
      'health.heartRate.read': { state: 'denied', canAskAgain: false },
    });
    const result = await execute(['heartRate']);
    expect(result.value).toMatchObject({ status: 'error', retryable: false });
    expect(load).not.toHaveBeenCalled();
  });
});
