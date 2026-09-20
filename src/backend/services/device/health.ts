import type { CategoryDataPoint, HealthKit, WorkoutDataPoint } from 'react-native-nitro-healthkit';

import { HEALTH_DATA_TYPES } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { normalizeOptionalDateRange, toIso, withNativeToolTimeout } from './utils';

const logger = loggerService.withContext('HealthData');
export const healthMetricNames = HEALTH_DATA_TYPES.filter((type) => type !== 'workouts');
type MetricState = 'available' | 'no-data' | 'error';
export type HealthMetricName = (typeof healthMetricNames)[number];
export type HealthKitLoader = () => Promise<HealthKit>;

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
) {
  const range = normalizeOptionalDateRange(input.startDate, input.endDate);
  const healthKit = await loadHealthKit();
  const metrics = input.metrics?.length ? input.metrics : [...healthMetricNames];
  const result =
    input.granularity === 'day'
      ? await getDailyHealthData(healthKit, metrics, range.start, range.end)
      : await getRangeHealthSummary(healthKit, metrics, range.start, range.end);
  return {
    ...result,
    endDate: range.end.toISOString(),
    granularity: input.granularity,
    startDate: range.start.toISOString(),
  };
}

export async function listHealthWorkouts(
  input: { endDate?: string; limit?: number; startDate?: string },
  loadHealthKit: HealthKitLoader = loadHealthKitModule,
) {
  const range = normalizeOptionalDateRange(input.startDate, input.endDate);
  const healthKit = await loadHealthKit();
  const workouts = await withNativeToolTimeout(
    healthKit.getWorkouts(range.start, range.end, false),
    'Workout query',
  );
  return workouts.slice(0, input.limit ?? 20).map(serializeWorkout);
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
          metricStates[metric] = samples.length ? 'available' : 'no-data';
          return [metric, { unit, value: samples.length ? sumSleepHours(samples) : null }] as const;
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
) {
  const daily = new Map<string, Record<string, { unit: string; value: number }>>();
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
          metricStates[metric] = samples.length ? 'available' : 'no-data';
          applyDailySleep(daily, samples);
        } else {
          const { unit } = quantityMetrics[metric];
          let found = false;
          // One aggregate per day instead of one raw fetch for the whole range:
          // the native per-day value is what the caller asked for, and the range
          // fetch it replaces is what made dense metrics exceed the timeout.
          for (const day of localDays(start, end)) {
            const value = await readQuantity(healthKit, metric, day.start, day.end);
            if (value === null) continue;
            found = true;
            daily.set(day.key, { ...daily.get(day.key), [metric]: { unit, value } });
          }
          metricStates[metric] = found ? 'available' : 'no-data';
        }
      } catch (error) {
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
  daily: Map<string, Record<string, { unit: string; value: number }>>,
  samples: CategoryDataPoint[],
) {
  for (const sample of samples) {
    if (!isAsleepSample(sample)) continue;
    const date = localDateKey(new Date(sample.startDate));
    const day = daily.get(date) ?? {};
    day.sleep = {
      unit: 'hours',
      value:
        (day.sleep?.value ?? 0) +
        (new Date(sample.endDate).getTime() - new Date(sample.startDate).getTime()) / 3_600_000,
    };
    daily.set(date, day);
  }
}

function sumSleepHours(samples: CategoryDataPoint[]) {
  return samples.reduce(
    (total, sample) =>
      isAsleepSample(sample)
        ? total +
          (new Date(sample.endDate).getTime() - new Date(sample.startDate).getTime()) / 3_600_000
        : total,
    0,
  );
}

function isAsleepSample(sample: CategoryDataPoint) {
  return sample.value === 1 || sample.value === 3 || sample.value === 4 || sample.value === 5;
}

function serializeWorkout(workout: WorkoutDataPoint) {
  return {
    activityName: workout.workoutActivityName,
    activityType: workout.workoutActivityType,
    durationSeconds: workout.duration,
    endDate: toIso(workout.endDate) ?? null,
    startDate: toIso(workout.startDate) ?? null,
    totalDistanceMeters: workout.totalDistance ?? null,
    totalEnergyKilocalories: workout.totalEnergyBurned ?? null,
  };
}
