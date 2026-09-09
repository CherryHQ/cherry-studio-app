import type { HealthKit, QuantityDataPoint } from 'react-native-nitro-healthkit';

import { getHealthSummary } from '../health';

const range = { startDate: '2026-09-01T00:00:00Z', endDate: '2026-09-02T00:00:00Z' };
const sample: QuantityDataPoint = {
  value: 100,
  unit: 'count',
  startDate: new Date('2026-09-01T10:00:00Z'),
  endDate: new Date('2026-09-01T10:10:00Z'),
};

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

  test('keeps the native aggregate and successful metrics when another query fails', async () => {
    const native = {
      getQuantityData: jest.fn(async () => [sample]),
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
  });

  test('daily results retain available days without inventing absent values', async () => {
    const native = {
      getQuantityData: jest.fn(async (identifier: string) => {
        if (identifier.includes('HeartRate')) throw new Error('Read access revoked');
        return identifier.includes('StepCount') ? [sample] : [];
      }),
    };
    const result = await getHealthSummary(
      { ...range, granularity: 'day', metrics: ['steps', 'heartRate', 'distance'] },
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
  });
});
