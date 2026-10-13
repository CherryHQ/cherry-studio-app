import type { HealthKit, QuantityDataPoint } from 'react-native-nitro-healthkit';

import { createHealthModule, getHealthSummary } from '../health';

const range = { startDate: '2026-09-01T00:00:00Z', endDate: '2026-09-02T00:00:00Z' };
const sample: QuantityDataPoint = {
  value: 100,
  unit: 'count',
  startDate: new Date('2026-09-01T10:00:00Z'),
  endDate: new Date('2026-09-01T10:10:00Z'),
};
/** Day boundaries follow the device timezone, so fixtures must too. */
const localIso = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day).toISOString();

describe('health summaries with incomplete data', () => {
  test('does not load native health data before a read inquiry completes', async () => {
    const loadHealthKit = jest.fn();
    const health = createHealthModule(
      {
        getStatuses: async (scopes) =>
          Object.fromEntries(
            scopes.map((scope) => [scope, { state: 'undetermined', canAskAgain: true }]),
          ),
      },
      loadHealthKit,
    );
    await expect(health.getOverview()).resolves.toEqual({
      state: 'access-required',
      canRequest: true,
    });
    expect(loadHealthKit).not.toHaveBeenCalled();
  });

  test('keeps an unsupported device separate from an outdated native client', async () => {
    for (const reason of ['unsupported', 'native-unavailable'] as const) {
      const loadHealthKit = jest.fn();
      const health = createHealthModule(
        {
          getStatuses: async (scopes) =>
            Object.fromEntries(
              scopes.map((scope) => [scope, { state: 'unavailable', reason, canAskAgain: false }]),
            ),
        },
        loadHealthKit,
      );
      await expect(health.getOverview()).resolves.toEqual({ state: 'unavailable', reason });
      expect(loadHealthKit).not.toHaveBeenCalled();
    }
  });

  test('the local overview reads only available scopes and keeps missing metrics null', async () => {
    const native = { getAggregatedQuantity: jest.fn(async () => 1200) };
    const health = createHealthModule(
      {
        getStatuses: async () => ({
          'health.steps.read': { state: 'requested', canAskAgain: false },
        }),
      },
      async () => native as unknown as HealthKit,
    );
    const overview = await health.getOverview();
    expect(overview).toMatchObject({
      state: 'ready',
      metrics: expect.arrayContaining([
        { type: 'steps', unit: 'count', value: 1200, state: 'available' },
        { type: 'sleep', unit: 'h', value: null, state: 'no-data' },
      ]),
    });
    expect(native.getAggregatedQuantity).toHaveBeenCalledTimes(1);
  });

  test('daily queries stop between days when the read is cancelled', async () => {
    const controller = new AbortController();
    const native = {
      getAggregatedQuantity: jest.fn(async () => {
        controller.abort();
        return 100;
      }),
    };
    await expect(
      getHealthSummary(
        {
          startDate: localIso(2026, 9, 1),
          endDate: localIso(2026, 9, 4),
          granularity: 'day',
          metrics: ['steps'],
        },
        async () => native as unknown as HealthKit,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.getAggregatedQuantity).toHaveBeenCalledTimes(1);
  });

  test('keeps missing records null and preserves a measured zero', async () => {
    const native = {
      getQuantityData: jest.fn(async (identifier: string) =>
        identifier.includes('StepCount') ? [{ ...sample, value: 0 }] : [],
      ),
      getCategoryData: jest.fn(async () => []),
      getAggregatedQuantity: jest.fn(async () => 0),
    };
    const result = await getHealthSummary(
      { ...range, granularity: 'summary', metrics: ['steps', 'heartRate', 'sleep'] },
      async () => native as unknown as HealthKit,
    );
    expect(result).toMatchObject({
      data: {
        steps: { unit: 'count', value: 0 },
        heartRate: { unit: 'bpm', value: null },
        sleep: { unit: 'hours', value: null },
      },
      metricStates: { steps: 'available', heartRate: 'no-data', sleep: 'no-data' },
    });
  });

  test('settles a non-zero aggregate without fetching raw samples', async () => {
    const native = {
      getQuantityData: jest.fn(async () => []),
      getAggregatedQuantity: jest.fn(async () => 8000),
    };
    const result = await getHealthSummary(
      { ...range, granularity: 'summary', metrics: ['steps'] },
      async () => native as unknown as HealthKit,
    );
    expect(result).toMatchObject({
      data: { steps: { value: 8000 } },
      metricStates: { steps: 'available' },
    });
    // Reading every raw sample up front is what made dense metrics time out.
    expect(native.getQuantityData).not.toHaveBeenCalled();
  });

  test('keeps the native aggregate and successful metrics when another query fails', async () => {
    const native = {
      getQuantityData: jest.fn(async () => []),
      getAggregatedQuantity: jest.fn(async (identifier: string) => {
        if (identifier.includes('HeartRate')) throw new Error('Read access revoked');
        // Native aggregation can deduplicate data from multiple sources.
        return 80;
      }),
    };
    const result = await getHealthSummary(
      { ...range, granularity: 'summary', metrics: ['steps', 'heartRate'] },
      async () => native as unknown as HealthKit,
    );
    expect(result).toMatchObject({
      data: { steps: { value: 80 }, heartRate: { value: null } },
      metricStates: { steps: 'available', heartRate: 'error' },
    });
    expect(native.getAggregatedQuantity).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierStepCount',
      new Date(range.startDate),
      new Date(range.endDate),
      'sum',
      false,
    );
  });

  test('reports a failed existence check as an error instead of missing records', async () => {
    const native = {
      getAggregatedQuantity: jest.fn(async () => 0),
      getQuantityData: jest.fn(async (identifier: string) => {
        if (identifier.includes('StepCount')) throw new Error('Read access revoked');
        return [];
      }),
    };
    const result = await getHealthSummary(
      { ...range, granularity: 'summary', metrics: ['steps', 'heartRate'] },
      async () => native as unknown as HealthKit,
    );
    expect(result).toMatchObject({
      data: { steps: { value: null }, heartRate: { value: null } },
      metricStates: { steps: 'error', heartRate: 'no-data' },
      // Without the reason, every failure mode reads the same in the result.
      metricErrors: { steps: 'Read access revoked' },
    });
  });

  test('aggregates each local day without inventing absent values', async () => {
    const native = {
      getQuantityData: jest.fn(async () => []),
      getAggregatedQuantity: jest.fn(async (identifier: string, start: Date) => {
        if (identifier.includes('HeartRate')) throw new Error('Read access revoked');
        return identifier.includes('StepCount') && start.getDate() === 1 ? 100 : 0;
      }),
    };
    const result = await getHealthSummary(
      {
        startDate: localIso(2026, 9, 1),
        endDate: localIso(2026, 9, 3),
        granularity: 'day',
        metrics: ['steps', 'heartRate', 'distance'],
      },
      async () => native as unknown as HealthKit,
    );
    expect(result.metricStates).toEqual({
      steps: 'available',
      heartRate: 'error',
      distance: 'no-data',
    });
    expect(result.data).toEqual([
      { date: '2026-09-01', metrics: { steps: { unit: 'count', value: 100 } } },
    ]);
    // One bounded query per day and metric, never one unbounded fetch per range.
    expect(native.getAggregatedQuantity).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierStepCount',
      new Date(2026, 8, 1),
      new Date(2026, 8, 2),
      'sum',
      false,
    );
  });
});
