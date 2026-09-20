import type { HealthKit, QuantityDataPoint } from 'react-native-nitro-healthkit';

import { getHealthSummary } from '../health';

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
