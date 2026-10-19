import type { CategoryDataPoint, HealthKit } from 'react-native-nitro-healthkit';

import { HEALTH_SUMMARY_METRICS } from '@/shared/contracts/health';
import { HEALTH_ENUM_VALUES } from '@/shared/contracts/healthValues';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { loadHealthDataReader, type HealthDataReaderLoader } from './healthData';
import { normalizeOptionalDateRange, withNativeToolTimeout } from './utils';

const logger = loggerService.withContext('HealthData');
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);
export const healthMetricNames = HEALTH_SUMMARY_METRICS;
type MetricState = 'available' | 'no-data' | 'error';
export type HealthMetricName = (typeof healthMetricNames)[number];
export type HealthKitLoader = () => Promise<HealthKit>;
type SleepInterval = { start: number; end: number };
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

const quantityMetrics: Record<
  Exclude<HealthMetricName, 'sleep'>,
  { aggregation: 'average' | 'sum'; identifier: string; unit: string }
> = {
  activeEnergy: {
    aggregation: 'sum',
    identifier: 'HKQuantityTypeIdentifierActiveEnergyBurned',
    unit: 'kcal',
  },
  distance: {
    aggregation: 'sum',
    identifier: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
    unit: 'm',
  },
  heartRate: {
    aggregation: 'average',
    identifier: 'HKQuantityTypeIdentifierHeartRate',
    unit: 'bpm',
  },
  hrv: {
    aggregation: 'average',
    identifier: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    unit: 'ms',
  },
  restingHeartRate: {
    aggregation: 'average',
    identifier: 'HKQuantityTypeIdentifierRestingHeartRate',
    unit: 'bpm',
  },
  steps: {
    aggregation: 'sum',
    identifier: 'HKQuantityTypeIdentifierStepCount',
    unit: 'count',
  },
};

export async function getHealthSummary(
  input: {
    endDate?: string;
    granularity: 'summary' | 'day';
    metrics?: HealthMetricName[];
    startDate?: string;
  },
  loadHealthKit: HealthKitLoader = loadHealthKitModule,
  signal?: AbortSignal,
) {
  const range = normalizeOptionalDateRange(input.startDate, input.endDate);
  const healthKit = await loadHealthKit();
  signal?.throwIfAborted();
  const metrics = [...new Set(input.metrics?.length ? input.metrics : healthMetricNames)];
  const result =
    input.granularity === 'day'
      ? await getDailyHealthData(healthKit, metrics, range.start, range.end, signal)
      : await getRangeHealthSummary(healthKit, metrics, range.start, range.end);
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

async function loadHealthKitModule(): Promise<HealthKit> {
  const { getHealthKit } = await import('react-native-nitro-healthkit');
  return getHealthKit();
}

async function getRangeHealthSummary(
  healthKit: HealthKit,
  metrics: HealthMetricName[],
  start: Date,
  end: Date,
) {
  const metricStates: Partial<Record<HealthMetricName, MetricState>> = {};
  const metricErrors: Partial<Record<HealthMetricName, string>> = {};
  const entries = await Promise.all(
    metrics.map(async (metric) => {
      const unit = metric === 'sleep' ? 'hours' : quantityMetrics[metric].unit;
      try {
        if (metric === 'sleep') {
          const samples = await withNativeToolTimeout(
            healthKit.getCategoryData('HKCategoryTypeIdentifierSleepAnalysis', start, end, false),
            'Sleep query',
          );
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
        const value = await readQuantity(healthKit, metric, start, end);
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
  healthKit: HealthKit,
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
          const samples = await withNativeToolTimeout(
            healthKit.getCategoryData('HKCategoryTypeIdentifierSleepAnalysis', start, end, false),
            'Sleep query',
          );
          signal?.throwIfAborted();
          const intervals = sleepIntervals(samples, start, end);
          metricStates[metric] = intervals.length ? 'available' : 'no-data';
          applyDailySleep(daily, intervals);
          applyDailySleepStages(daily, samples, start, end);
        } else {
          const { unit } = quantityMetrics[metric];
          let found = false;
          // One aggregate per day instead of one raw fetch for the whole range:
          // the native per-day value is what the caller asked for, and the range
          // fetch it replaces is what made dense metrics exceed the timeout.
          for (const day of localDays(start, end)) {
            signal?.throwIfAborted();
            const value = await readQuantity(healthKit, metric, day.start, day.end);
            if (value === null) continue;
            found = true;
            daily.set(day.key, { ...daily.get(day.key), [metric]: { unit, value } });
          }
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

/**
 * The native aggregate reports an empty range as zero, so a zero result alone
 * cannot tell a measured zero from a missing record. Settle it with a raw
 * existence query, which is cheap exactly when it runs: a zero aggregate means
 * the range holds few or no samples. Probing first instead would fetch every
 * sample in the range, and dense metrics such as heart rate or step count
 * exceed the native timeout long before that completes on a real device.
 */
async function readQuantity(
  healthKit: HealthKit,
  metric: Exclude<HealthMetricName, 'sleep'>,
  start: Date,
  end: Date,
): Promise<number | null> {
  const config = quantityMetrics[metric];
  const value = await withNativeToolTimeout(
    healthKit.getAggregatedQuantity(config.identifier, start, end, config.aggregation, false),
    `${metric} query`,
  );
  if (value !== 0) return value;
  const samples = await withNativeToolTimeout(
    healthKit.getQuantityData(config.identifier, start, end, null, false),
    `${metric} availability query`,
  );
  return samples.length ? 0 : null;
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
  samples: CategoryDataPoint[],
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

function sleepDetails(
  samples: CategoryDataPoint[],
  start: Date,
  end: Date,
  asleep: SleepInterval[],
) {
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
  samples: CategoryDataPoint[],
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
