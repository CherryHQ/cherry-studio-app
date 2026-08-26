import type {
  CategoryDataPoint,
  HealthKit,
  QuantityDataPoint,
  WorkoutDataPoint,
} from 'react-native-nitro-healthkit';

import { normalizeOptionalDateRange, toIso, withNativeToolTimeout } from './utils';

export const healthMetricNames = [
  'steps',
  'activeEnergy',
  'distance',
  'heartRate',
  'restingHeartRate',
  'hrv',
  'sleep',
] as const;
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
  const data =
    input.granularity === 'day'
      ? await getDailyHealthData(healthKit, metrics, range.start, range.end)
      : await getRangeHealthSummary(healthKit, metrics, range.start, range.end);
  return {
    data,
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
  const entries = await Promise.all(
    metrics.map(async (metric) => {
      if (metric === 'sleep') {
        const samples = await withNativeToolTimeout(
          healthKit.getCategoryData('HKCategoryTypeIdentifierSleepAnalysis', start, end, false),
          'Sleep query',
        );
        return [metric, { unit: 'hours', value: sumSleepHours(samples) }] as const;
      }
      const config = quantityMetrics[metric];
      const value = await withNativeToolTimeout(
        healthKit.getAggregatedQuantity(config.identifier, start, end, config.aggregation, false),
        `${metric} query`,
      );
      return [metric, { unit: config.unit, value }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function getDailyHealthData(
  healthKit: HealthKit,
  metrics: HealthMetricName[],
  start: Date,
  end: Date,
) {
  const daily = new Map<string, Record<string, { unit: string; value: number }>>();
  await Promise.all(
    metrics.map(async (metric) => {
      if (metric === 'sleep') {
        applyDailySleep(
          daily,
          await withNativeToolTimeout(
            healthKit.getCategoryData('HKCategoryTypeIdentifierSleepAnalysis', start, end, false),
            'Sleep query',
          ),
        );
        return;
      }
      const config = quantityMetrics[metric];
      applyDailyQuantity(
        daily,
        metric,
        config,
        await withNativeToolTimeout(
          healthKit.getQuantityData(config.identifier, start, end, null, false),
          `${metric} query`,
        ),
      );
    }),
  );
  return [...daily.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, metrics]) => ({ date, metrics }));
}

function applyDailyQuantity(
  daily: Map<string, Record<string, { unit: string; value: number }>>,
  metric: Exclude<HealthMetricName, 'sleep'>,
  config: { aggregation: 'average' | 'sum'; unit: string },
  samples: QuantityDataPoint[],
) {
  const buckets = new Map<string, number[]>();
  for (const sample of samples) {
    const date = new Date(sample.startDate).toISOString().slice(0, 10);
    buckets.set(date, [...(buckets.get(date) ?? []), sample.value]);
  }
  for (const [date, values] of buckets) {
    const sum = values.reduce((total, value) => total + value, 0);
    const day = daily.get(date) ?? {};
    day[metric] = {
      unit: config.unit,
      value: config.aggregation === 'sum' ? sum : sum / values.length,
    };
    daily.set(date, day);
  }
}

function applyDailySleep(
  daily: Map<string, Record<string, { unit: string; value: number }>>,
  samples: CategoryDataPoint[],
) {
  for (const sample of samples) {
    if (!isAsleepSample(sample)) continue;
    const date = new Date(sample.startDate).toISOString().slice(0, 10);
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
