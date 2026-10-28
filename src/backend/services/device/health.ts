import { HEALTH_SUMMARY_METRICS, type HealthDataType } from '@/shared/contracts/health';
import { HEALTH_ENUM_VALUES } from '@/shared/contracts/healthValues';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { HealthQueryOptions } from '../../../../modules/health-access';
import { loadHealthDataReader, type HealthDataReaderLoader } from './healthData';
import { normalizeOptionalDateRange, withNativeToolTimeout } from './utils';

const logger = loggerService.withContext('HealthData');
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);
export const healthMetricNames = HEALTH_SUMMARY_METRICS;
type MetricState = 'available' | 'no-data' | 'error';
export type HealthMetricName = (typeof healthMetricNames)[number];
type HealthDataReader = Awaited<ReturnType<HealthDataReaderLoader>>;
type SleepSample = { value: number; startDate: string; endDate: string };
type SleepInterval = { start: number; end: number };
const SLEEP_PAGE_SIZE = 200;
const SLEEP_STAGES = {
  inBed: 0,
  asleepUnspecified: 1,
  awake: 2,
  core: 3,
  deep: 4,
  rem: 5,
} as const;
type SleepStages = Record<keyof typeof SLEEP_STAGES, number | null>;
type HealthMetricValue = { unit: string; value: number | null; stages?: SleepStages };
const emptySleepStages = (): SleepStages => ({
  inBed: null,
  asleepUnspecified: null,
  awake: null,
  core: null,
  deep: null,
  rem: null,
});

/**
 * Summary metrics read in fixed units, whatever the person's display units are. `unit` is the label
 * the result reports; `hkUnit` is the HealthKit unit the statistics are read in.
 */
const quantityMetrics: Record<
  Exclude<HealthMetricName, 'sleep'>,
  {
    aggregation: 'average' | 'sum';
    hkUnit: NonNullable<HealthQueryOptions['unit']>;
    type: HealthDataType;
    unit: string;
  }
> = {
  activeEnergy: { aggregation: 'sum', hkUnit: 'kcal', type: 'activeEnergy', unit: 'kcal' },
  distance: { aggregation: 'sum', hkUnit: 'm', type: 'distance', unit: 'm' },
  heartRate: { aggregation: 'average', hkUnit: 'count/min', type: 'heartRate', unit: 'bpm' },
  hrv: { aggregation: 'average', hkUnit: 'ms', type: 'hrv', unit: 'ms' },
  restingHeartRate: {
    aggregation: 'average',
    hkUnit: 'count/min',
    type: 'restingHeartRate',
    unit: 'bpm',
  },
  steps: { aggregation: 'sum', hkUnit: 'count', type: 'steps', unit: 'count' },
};

export async function getHealthSummary(
  input: {
    endDate?: string;
    granularity: 'summary' | 'day';
    metrics?: HealthMetricName[];
    startDate?: string;
  },
  load: HealthDataReaderLoader = loadHealthDataReader,
  signal?: AbortSignal,
) {
  const range = normalizeOptionalDateRange(input.startDate, input.endDate);
  const reader = await load();
  signal?.throwIfAborted();
  const metrics = [...new Set(input.metrics?.length ? input.metrics : healthMetricNames)];
  const result =
    input.granularity === 'day'
      ? await getDailyHealthData(reader, metrics, range.start, range.end, signal)
      : await getRangeHealthSummary(reader, metrics, range.start, range.end, signal);
  return {
    ...result,
    endDate: range.end.toISOString(),
    granularity: input.granularity,
    ...(metrics.includes('sleep')
      ? {
          sleepNote:
            'Sleep and stage values are hours. Each stage merges overlaps independently, so stages from conflicting sources must not be summed. Missing stages stay null; no public sleep-score type is available.',
        }
      : {}),
    startDate: range.start.toISOString(),
  };
}

export async function listHealthWorkouts(
  input: { endDate?: string; limit?: number; startDate?: string },
  load: HealthDataReaderLoader = loadHealthDataReader,
) {
  const range = normalizeOptionalDateRange(input.startDate, input.endDate);
  const limit = input.limit ?? 20;
  const reader = await load();
  const workouts = await withNativeToolTimeout(
    reader.listWorkouts(range.start.toISOString(), range.end.toISOString(), limit + 1),
    'Workout query',
  );
  return {
    data: workouts.slice(0, limit).map((workout) => ({
      ...workout,
      activityName: HEALTH_ENUM_VALUES.HKWorkoutActivityType?.[workout.activityType] ?? 'Unknown',
    })),
    hasMore: workouts.length > limit,
    limit,
    startDate: range.start.toISOString(),
    endDate: range.end.toISOString(),
  };
}

async function getRangeHealthSummary(
  reader: HealthDataReader,
  metrics: HealthMetricName[],
  start: Date,
  end: Date,
  signal?: AbortSignal,
) {
  const metricStates: Partial<Record<HealthMetricName, MetricState>> = {};
  const metricErrors: Partial<Record<HealthMetricName, string>> = {};
  const entries = await Promise.all(
    metrics.map(async (metric) => {
      const unit = metric === 'sleep' ? 'hours' : quantityMetrics[metric].unit;
      try {
        if (metric === 'sleep') {
          const samples = await readSleepSamples(reader, start, end, signal);
          const intervals = sleepIntervals(samples, start, end);
          metricStates[metric] = intervals.length ? 'available' : 'no-data';
          return [
            metric,
            {
              unit,
              value: intervals.length ? sumSleepHours(intervals) : null,
              ...sleepDetails(samples, start, end, intervals),
            },
          ] as const;
        }
        const [statistics] = await readStatistics(reader, metric, start, end, 'summary');
        const value = statisticsValue(metric, statistics);
        metricStates[metric] = value === null ? 'no-data' : 'available';
        return [metric, { unit, value }] as const;
      } catch (error) {
        logger.warn('Health metric query failed', { metric, error });
        metricStates[metric] = 'error';
        metricErrors[metric] = describeError(error);
        return [metric, { unit, value: null }] as const;
      }
    }),
  );
  return { data: Object.fromEntries(entries), metricStates, ...reportErrors(metricErrors) };
}

async function getDailyHealthData(
  reader: HealthDataReader,
  metrics: HealthMetricName[],
  start: Date,
  end: Date,
  signal?: AbortSignal,
) {
  const daily = new Map<string, Record<string, HealthMetricValue>>();
  const metricStates: Partial<Record<HealthMetricName, MetricState>> = {};
  const metricErrors: Partial<Record<HealthMetricName, string>> = {};
  await Promise.all(
    metrics.map(async (metric) => {
      try {
        if (metric === 'sleep') {
          const samples = await readSleepSamples(reader, start, end, signal);
          const intervals = sleepIntervals(samples, start, end);
          metricStates[metric] = intervals.length ? 'available' : 'no-data';
          applyDailySleep(daily, intervals);
          applyDailySleepStages(daily, samples, start, end);
        } else {
          const { unit } = quantityMetrics[metric];
          let found = false;
          // One native collection query yields every local day; a day without samples is null.
          for (const day of await readStatistics(reader, metric, start, end, 'day')) {
            const value = statisticsValue(metric, day);
            if (value === null || typeof day.date !== 'string') continue;
            found = true;
            daily.set(day.date, { ...daily.get(day.date), [metric]: { unit, value } });
          }
          signal?.throwIfAborted();
          metricStates[metric] = found ? 'available' : 'no-data';
        }
      } catch (error) {
        signal?.throwIfAborted();
        logger.warn('Daily health metric query failed', { metric, error });
        metricStates[metric] = 'error';
        metricErrors[metric] = describeError(error);
      }
    }),
  );
  return {
    data: [...daily.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, metrics]) => ({ date, metrics })),
    metricStates,
    ...reportErrors(metricErrors),
  };
}

type HealthStatistics = Record<string, unknown> & { date?: unknown };

/** Native statistics tell a measured zero from a range without samples, which reads as null. */
async function readStatistics(
  reader: HealthDataReader,
  metric: Exclude<HealthMetricName, 'sleep'>,
  start: Date,
  end: Date,
  granularity: HealthQueryOptions['granularity'],
): Promise<HealthStatistics[]> {
  const config = quantityMetrics[metric];
  const result = await withNativeToolTimeout(
    reader.query(config.type, {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      limit: 1,
      cursor: '',
      mode: 'statistics',
      granularity,
      workoutId: '',
      unit: config.hkUnit,
    }),
    `${metric} query`,
  );
  const data = result.data;
  if (Array.isArray(data)) return data as HealthStatistics[];
  return data && typeof data === 'object' ? [data as HealthStatistics] : [];
}

function statisticsValue(
  metric: Exclude<HealthMetricName, 'sleep'>,
  statistics: HealthStatistics | undefined,
): number | null {
  const value = statistics?.[quantityMetrics[metric].aggregation];
  return typeof value === 'number' ? value : null;
}

/** Sleep stages need raw category samples; the anchored query pages them in HealthKit order. */
async function readSleepSamples(
  reader: HealthDataReader,
  start: Date,
  end: Date,
  signal?: AbortSignal,
): Promise<SleepSample[]> {
  const samples: SleepSample[] = [];
  let cursor = '';
  for (;;) {
    signal?.throwIfAborted();
    const page = await withNativeToolTimeout(
      reader.query('sleep', {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        limit: SLEEP_PAGE_SIZE,
        cursor,
        mode: 'samples',
        granularity: 'summary',
        workoutId: '',
      }),
      'Sleep query',
    );
    for (const row of Array.isArray(page.data) ? page.data : []) {
      const sample = row as Partial<SleepSample>;
      if (
        typeof sample.value === 'number' &&
        typeof sample.startDate === 'string' &&
        typeof sample.endDate === 'string'
      )
        samples.push({ value: sample.value, startDate: sample.startDate, endDate: sample.endDate });
    }
    if (page.hasMore !== true || typeof page.nextCursor !== 'string') return samples;
    cursor = page.nextCursor;
  }
}

/**
 * `error` alone cannot be acted on: a native timeout, a missing type, and a
 * revoked grant all read the same. Carry the reason so the failure is
 * diagnosable from the tool result instead of only from a device log.
 */
function describeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

/** Absent rather than empty, so a successful read carries no failure field. */
function reportErrors(metricErrors: Partial<Record<HealthMetricName, string>>) {
  return Object.keys(metricErrors).length > 0 ? { metricErrors } : {};
}

/** Calendar days in the device's timezone, clipped to the requested range. */
function* localDays(start: Date, end: Date) {
  let cursor = start;
  while (cursor < end) {
    const midnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const next = midnight < end ? midnight : end;
    yield { end: next, key: localDateKey(cursor), start: cursor };
    cursor = next;
  }
}

function localDateKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${`${date.getDate()}`.padStart(2, '0')}`;
}

function applyDailySleep(
  daily: Map<string, Record<string, HealthMetricValue>>,
  intervals: SleepInterval[],
) {
  for (const interval of intervals) {
    for (const part of localDays(new Date(interval.start), new Date(interval.end))) {
      const day = daily.get(part.key) ?? {};
      day.sleep = {
        unit: 'hours',
        value: (day.sleep?.value ?? 0) + (part.end.getTime() - part.start.getTime()) / 3_600_000,
      };
      daily.set(part.key, day);
    }
  }
}

function sumSleepHours(intervals: SleepInterval[]) {
  return (
    intervals.reduce((total, interval) => total + interval.end - interval.start, 0) / 3_600_000
  );
}

/** HealthKit returns overlapping, untrimmed samples, including records from multiple sources. */
function sleepIntervals(
  samples: SleepSample[],
  start: Date,
  end: Date,
  values = ASLEEP_VALUES,
): SleepInterval[] {
  const intervals: SleepInterval[] = [];
  for (const sample of samples) {
    // The default selection is asleep; stage breakdowns select a single category.
    if (!values.has(sample.value)) continue;
    const interval = {
      start: Math.max(start.getTime(), new Date(sample.startDate).getTime()),
      end: Math.min(end.getTime(), new Date(sample.endDate).getTime()),
    };
    if (interval.end > interval.start) intervals.push(interval);
  }
  intervals.sort((left, right) => left.start - right.start);
  const merged: SleepInterval[] = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

function sleepDetails(samples: SleepSample[], start: Date, end: Date, asleep: SleepInterval[]) {
  const stages = emptySleepStages();
  for (const [stage, value] of Object.entries(SLEEP_STAGES)) {
    const intervals = sleepIntervals(samples, start, end, new Set([value]));
    stages[stage as keyof SleepStages] = intervals.length ? sumSleepHours(intervals) : null;
  }
  return {
    stages,
    firstSleepStart: asleep[0] ? new Date(asleep[0].start).toISOString() : null,
    lastSleepEnd: asleep.length ? new Date(asleep[asleep.length - 1]!.end).toISOString() : null,
  };
}

function applyDailySleepStages(
  daily: Map<string, Record<string, HealthMetricValue>>,
  samples: SleepSample[],
  start: Date,
  end: Date,
) {
  for (const [name, value] of Object.entries(SLEEP_STAGES)) {
    const stage = name as keyof SleepStages;
    for (const interval of sleepIntervals(samples, start, end, new Set([value]))) {
      for (const part of localDays(new Date(interval.start), new Date(interval.end))) {
        const day = daily.get(part.key) ?? {};
        const sleep = day.sleep ?? { unit: 'hours', value: null };
        const stages = sleep.stages ?? emptySleepStages();
        stages[stage] =
          (stages[stage] ?? 0) + (part.end.getTime() - part.start.getTime()) / 3_600_000;
        day.sleep = { ...sleep, stages };
        daily.set(part.key, day);
      }
    }
  }
}
