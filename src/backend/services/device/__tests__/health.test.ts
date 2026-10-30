import type { HealthDataType } from '@/shared/contracts/health';

import type { HealthDataResult, HealthQueryOptions } from '../../../../../modules/health-access';
import { getHealthSummary, listHealthWorkouts } from '../health';
import type { HealthDataReaderLoader } from '../healthData';

const range = { startDate: '2026-09-01T00:00:00Z', endDate: '2026-09-02T00:00:00Z' };
/** Day boundaries follow the device timezone, so fixtures must too. */
const localIso = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day).toISOString();

function healthReader(
  answer: (type: HealthDataType, options: HealthQueryOptions) => HealthDataResult,
) {
  const query = jest.fn(async (type: HealthDataType, options: HealthQueryOptions) =>
    answer(type, options),
  );
  return { load: (async () => ({ query })) as unknown as HealthDataReaderLoader, query };
}

describe('health summaries with incomplete data', () => {
  test('daily queries stop when the read is cancelled', async () => {
    const controller = new AbortController();
    const { load } = healthReader(() => {
      controller.abort();
      return { data: [{ date: '2026-09-01', sum: 100 }] };
    });
    await expect(
      getHealthSummary(
        {
          startDate: localIso(2026, 9, 1),
          endDate: localIso(2026, 9, 4),
          granularity: 'day',
          metrics: ['steps'],
        },
        load,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('keeps missing records null and preserves a measured zero', async () => {
    const { load } = healthReader((type) =>
      type === 'steps'
        ? { data: { sum: 0 } }
        : type === 'sleep'
          ? { data: [], hasMore: false }
          : { data: null },
    );
    const result = await getHealthSummary(
      { ...range, granularity: 'summary', metrics: ['steps', 'heartRate', 'sleep'] },
      load,
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

  test('reads each metric once in its fixed unit, summing or averaging by metric', async () => {
    const { load, query } = healthReader((type) =>
      type === 'steps' ? { data: { sum: 8000 } } : { data: { average: 62 } },
    );
    const result = await getHealthSummary(
      { ...range, granularity: 'summary', metrics: ['steps', 'heartRate'] },
      load,
    );
    expect(result).toMatchObject({
      data: { steps: { unit: 'count', value: 8000 }, heartRate: { unit: 'bpm', value: 62 } },
      metricStates: { steps: 'available', heartRate: 'available' },
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledWith('steps', {
      startDate: new Date(range.startDate).toISOString(),
      endDate: new Date(range.endDate).toISOString(),
      limit: 1,
      cursor: '',
      mode: 'statistics',
      granularity: 'summary',
      workoutId: '',
      unit: 'count',
    });
    expect(query).toHaveBeenCalledWith(
      'heartRate',
      expect.objectContaining({ mode: 'statistics', unit: 'count/min' }),
    );
  });

  test('keeps successful metrics and the failure reason when another query fails', async () => {
    const { load } = healthReader((type) => {
      if (type === 'heartRate') throw new Error('Read access revoked');
      return { data: { sum: 80 } };
    });
    const result = await getHealthSummary(
      { ...range, granularity: 'summary', metrics: ['steps', 'heartRate'] },
      load,
    );
    expect(result).toMatchObject({
      data: { steps: { value: 80 }, heartRate: { value: null } },
      metricStates: { steps: 'available', heartRate: 'error' },
      // Without the reason, every failure mode reads the same in the result.
      metricErrors: { heartRate: 'Read access revoked' },
    });
  });

  test('reads every local day in one query without inventing absent values', async () => {
    const { load, query } = healthReader((type) => {
      if (type === 'heartRate') throw new Error('Read access revoked');
      return {
        data: [
          { date: '2026-09-01', sum: type === 'steps' ? 100 : null },
          { date: '2026-09-02', sum: null },
        ],
      };
    });
    const result = await getHealthSummary(
      {
        startDate: localIso(2026, 9, 1),
        endDate: localIso(2026, 9, 3),
        granularity: 'day',
        metrics: ['steps', 'heartRate', 'distance'],
      },
      load,
    );
    expect(result.metricStates).toEqual({
      steps: 'available',
      heartRate: 'error',
      distance: 'no-data',
    });
    expect(result.data).toEqual([
      { date: '2026-09-01', metrics: { steps: { unit: 'count', value: 100 } } },
    ]);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenCalledWith(
      'distance',
      expect.objectContaining({ granularity: 'day', unit: 'm' }),
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
  ) => ({
    value,
    startDate: new Date(2026, 8, day, hour).toISOString(),
    endDate: new Date(2026, 8, endDay, endHour).toISOString(),
  });
  const loadSamples = (samples: ReturnType<typeof sleepSample>[]) =>
    healthReader(() => ({ data: samples, hasMore: false })).load;

  test('pages through every sleep sample', async () => {
    const { load, query } = healthReader((_type, options) =>
      options.cursor
        ? { data: [sleepSample(1, 2, 3, 2, 4)], hasMore: false, nextCursor: null }
        : { data: [sleepSample(1, 2, 1, 2, 2)], hasMore: true, nextCursor: 'next' },
    );
    const result = await getHealthSummary(
      {
        startDate: localIso(2026, 9, 2),
        endDate: localIso(2026, 9, 3),
        granularity: 'summary',
        metrics: ['sleep'],
      },
      load,
    );
    expect(result).toMatchObject({ data: { sleep: { value: 2 } } });
    expect(query).toHaveBeenLastCalledWith(
      'sleep',
      expect.objectContaining({ mode: 'samples', cursor: 'next', limit: 200 }),
    );
  });

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
    const { load } = healthReader((type) => {
      if (type === 'sleep') throw new Error('Sleep query timed out');
      return { data: { sum: 100 } };
    });
    const result = await getHealthSummary(
      { ...range, granularity: 'summary', metrics: ['steps', 'sleep'] },
      load,
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
