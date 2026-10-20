import type { CategoryDataPoint, HealthKit, QuantityDataPoint } from 'react-native-nitro-healthkit';

import { getHealthSummary, listHealthWorkouts } from '../health';
import type { HealthDataReaderLoader } from '../healthData';

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

describe('sleep intervals', () => {
  const sleepSample = (
    value: number,
    day: number,
    hour: number,
    endDay: number,
    endHour: number,
  ): CategoryDataPoint => ({
    value,
    startDate: new Date(2026, 8, day, hour),
    endDate: new Date(2026, 8, endDay, endHour),
  });
  const loadSamples = (samples: CategoryDataPoint[]) => async () =>
    ({
      getCategoryData: async () => samples,
    }) as unknown as HealthKit;

  test.each([1, 3, 4, 5])('includes asleep category %i', async (value) => {
    const result = await getHealthSummary(
      {
        startDate: localIso(2026, 9, 2),
        endDate: localIso(2026, 9, 3),
        granularity: 'summary',
        metrics: ['sleep'],
      },
      loadSamples([sleepSample(value, 2, 1, 2, 2)]),
    );
    expect(result).toMatchObject({
      data: { sleep: { unit: 'hours', value: 1 } },
      metricStates: { sleep: 'available' },
    });
  });

  test.each(['summary', 'day'] as const)(
    'clips and deduplicates asleep intervals for %s',
    async (granularity) => {
      const result = await getHealthSummary(
        {
          startDate: localIso(2026, 9, 2),
          endDate: localIso(2026, 9, 3),
          granularity,
          metrics: ['sleep'],
        },
        loadSamples([
          sleepSample(5, 2, 23, 3, 1),
          sleepSample(3, 2, 3, 2, 7),
          sleepSample(1, 1, 23, 2, 7),
          sleepSample(1, 1, 23, 2, 7),
          sleepSample(4, 2, 1, 2, 4),
          sleepSample(3, 2, 13, 2, 14),
          sleepSample(0, 1, 22, 2, 9),
          sleepSample(2, 2, 8, 2, 10),
        ]),
      );
      const sleep = {
        unit: 'hours',
        value: 9,
        stages: { inBed: 9, awake: 2, asleepUnspecified: 7, core: 5, deep: 3, rem: 1 },
      };
      expect(result.data).toMatchObject(
        granularity === 'summary' ? { sleep } : [{ date: '2026-09-02', metrics: { sleep } }],
      );
      expect(result.metricStates).toEqual({ sleep: 'available' });
    },
  );

  test('splits overnight sleep at local midnight and clips both range boundaries', async () => {
    const result = await getHealthSummary(
      {
        startDate: new Date(2026, 8, 1, 23).toISOString(),
        endDate: new Date(2026, 8, 3, 6).toISOString(),
        granularity: 'day',
        metrics: ['sleep'],
      },
      loadSamples([sleepSample(1, 1, 22, 2, 7), sleepSample(1, 2, 23, 3, 8)]),
    );
    expect(result.data).toMatchObject([
      { date: '2026-09-01', metrics: { sleep: { unit: 'hours', value: 1 } } },
      { date: '2026-09-02', metrics: { sleep: { unit: 'hours', value: 8 } } },
      { date: '2026-09-03', metrics: { sleep: { unit: 'hours', value: 6 } } },
    ]);
  });

  test('does not count daily sleep twice when the same metric is requested twice', async () => {
    const result = await getHealthSummary(
      {
        startDate: localIso(2026, 9, 2),
        endDate: localIso(2026, 9, 3),
        granularity: 'day',
        metrics: ['sleep', 'sleep'],
      },
      loadSamples([sleepSample(1, 2, 1, 2, 2)]),
    );
    expect(result.data).toMatchObject([
      { date: '2026-09-02', metrics: { sleep: { unit: 'hours', value: 1 } } },
    ]);
  });

  test.each(['summary', 'day'] as const)(
    'does not invent sleep from in-bed, awake or out-of-range samples for %s',
    async (granularity) => {
      const result = await getHealthSummary(
        {
          startDate: localIso(2026, 9, 2),
          endDate: localIso(2026, 9, 3),
          granularity,
          metrics: ['sleep'],
        },
        loadSamples([
          sleepSample(0, 1, 23, 2, 7),
          sleepSample(2, 2, 6, 2, 7),
          sleepSample(1, 1, 22, 2, 0),
          sleepSample(1, 3, 0, 3, 7),
          sleepSample(3, 2, 8, 2, 8),
        ]),
      );
      expect(result.metricStates).toEqual({ sleep: 'no-data' });
      expect(result.data).toMatchObject(
        granularity === 'summary'
          ? { sleep: { unit: 'hours', value: null, stages: { inBed: 7, awake: 1, core: null } } }
          : [
              {
                date: '2026-09-02',
                metrics: { sleep: { value: null, stages: { inBed: 7, awake: 1, core: null } } },
              },
            ],
      );
    },
  );

  test('keeps a sleep read failure distinct from missing data and preserves steps', async () => {
    const native = {
      getCategoryData: async () => {
        throw new Error('Sleep query timed out');
      },
      getAggregatedQuantity: async () => 100,
    };
    const result = await getHealthSummary(
      { ...range, granularity: 'summary', metrics: ['steps', 'sleep'] },
      async () => native as unknown as HealthKit,
    );
    expect(result).toMatchObject({
      data: { steps: { value: 100 }, sleep: { value: null } },
      metricStates: { steps: 'available', sleep: 'error' },
      metricErrors: { sleep: 'Sleep query timed out' },
    });
  });
});

describe('workout summaries', () => {
  const workout = {
    id: 'workout-1',
    activityType: 37,
    durationSeconds: 3600,
    startDate: range.startDate,
    endDate: range.endDate,
    totalDistanceMeters: null,
    totalEnergyKilocalories: null,
  };

  test('preserves missing measurements and measured zero from the native reader', async () => {
    const listWorkouts = jest.fn(async () => [
      workout,
      { ...workout, totalDistanceMeters: 0, totalEnergyKilocalories: 0 },
    ]);
    const load = (async () => ({ listWorkouts })) as unknown as HealthDataReaderLoader;
    const result = await listHealthWorkouts(range, load);
    expect(
      result.data.map(({ totalDistanceMeters, totalEnergyKilocalories }) => ({
        totalDistanceMeters,
        totalEnergyKilocalories,
      })),
    ).toEqual([
      { totalDistanceMeters: null, totalEnergyKilocalories: null },
      { totalDistanceMeters: 0, totalEnergyKilocalories: 0 },
    ]);
    expect(listWorkouts).toHaveBeenCalledWith(
      new Date(range.startDate).toISOString(),
      new Date(range.endDate).toISOString(),
      21,
    );
  });

  test.each([20, 21])('reports whether the default limit truncates %i workouts', async (count) => {
    const load = (async () => ({
      listWorkouts: async () => Array.from({ length: count }, () => workout),
    })) as unknown as HealthDataReaderLoader;
    const result = await listHealthWorkouts(range, load);
    expect(result.data).toHaveLength(20);
    expect(result.hasMore).toBe(count > 20);
  });
});
