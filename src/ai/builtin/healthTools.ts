import { type ToolSet, tool } from 'ai';
import type {
  CategoryDataPoint,
  HealthKit,
  QuantityDataPoint,
  WorkoutDataPoint,
} from 'react-native-nitro-healthkit';
import * as z from 'zod';

import { normalizeOptionalDateRange, toIso, withNativeToolTimeout } from './toolUtils';

const healthMetricNames = [
  'steps',
  'activeEnergy',
  'distance',
  'heartRate',
  'restingHeartRate',
  'hrv',
  'sleep',
] as const;
type HealthMetricName = (typeof healthMetricNames)[number];
type HealthKitLoader = () => Promise<HealthKit>;

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

const healthSummaryInput = z
  .object({
    endDate: z.string().datetime({ offset: true }).optional(),
    granularity: z.enum(['summary', 'day']).default('summary'),
    metrics: z.array(z.enum(healthMetricNames)).min(1).max(healthMetricNames.length).optional(),
    startDate: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const workoutsInput = z
  .object({
    endDate: z.string().datetime({ offset: true }).optional(),
    limit: z.number().int().min(1).max(50).default(20),
    startDate: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export function createHealthTools(loadHealthKit: HealthKitLoader = loadHealthKitModule): ToolSet {
  return {
    builtin_get_health_summary: tool({
      description:
        'Read selected health metrics as a range summary or daily aggregates, for at most 90 days.',
      inputSchema: healthSummaryInput,
      strict: true,
      execute: async ({ endDate, granularity, metrics, startDate }) => {
        const range = normalizeOptionalDateRange(startDate, endDate);
        const healthKit = await loadHealthKit();
        const selectedMetrics = metrics ?? [...healthMetricNames];
        const data =
          granularity === 'day'
            ? await getDailyHealthData(healthKit, selectedMetrics, range.start, range.end)
            : await getHealthSummary(healthKit, selectedMetrics, range.start, range.end);
        return {
          data,
          endDate: range.end.toISOString(),
          granularity,
          startDate: range.start.toISOString(),
        };
      },
    }),
    builtin_list_workouts: tool({
      description: 'List up to 50 workouts from a date range of at most 90 days.',
      inputSchema: workoutsInput,
      strict: true,
      execute: async ({ endDate, limit, startDate }) => {
        const range = normalizeOptionalDateRange(startDate, endDate);
        const healthKit = await loadHealthKit();
        const workouts = await withNativeToolTimeout(
          healthKit.getWorkouts(range.start, range.end, false),
          'Workout query',
        );
        return workouts.slice(0, limit).map(serializeWorkout);
      },
    }),
  };
}

async function loadHealthKitModule(): Promise<HealthKit> {
  const { getHealthKit } = await import('react-native-nitro-healthkit');
  return getHealthKit();
}

async function getHealthSummary(
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
        const samples = await withNativeToolTimeout(
          healthKit.getCategoryData('HKCategoryTypeIdentifierSleepAnalysis', start, end, false),
          'Sleep query',
        );
        applyDailySleep(daily, samples);
        return;
      }

      const config = quantityMetrics[metric];
      const samples = await withNativeToolTimeout(
        healthKit.getQuantityData(config.identifier, start, end, null, false),
        `${metric} query`,
      );
      applyDailyQuantity(daily, metric, config, samples);
    }),
  );

  return [...daily.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, metricsForDay]) => ({ date, metrics: metricsForDay }));
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
    const values = buckets.get(date) ?? [];
    values.push(sample.value);
    buckets.set(date, values);
  }

  for (const [date, values] of buckets) {
    const value =
      config.aggregation === 'sum'
        ? values.reduce((total, item) => total + item, 0)
        : values.reduce((total, item) => total + item, 0) / values.length;
    const day = daily.get(date) ?? {};
    day[metric] = { unit: config.unit, value };
    daily.set(date, day);
  }
}

function applyDailySleep(
  daily: Map<string, Record<string, { unit: string; value: number }>>,
  samples: CategoryDataPoint[],
) {
  for (const sample of samples) {
    if (!isAsleepSample(sample)) {
      continue;
    }
    const date = new Date(sample.startDate).toISOString().slice(0, 10);
    const day = daily.get(date) ?? {};
    const current = day.sleep?.value ?? 0;
    day.sleep = {
      unit: 'hours',
      value:
        current +
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
    endDate: toIso(workout.endDate),
    startDate: toIso(workout.startDate),
    totalDistanceMeters: workout.totalDistance ?? null,
    totalEnergyKilocalories: workout.totalEnergyBurned ?? null,
  };
}
