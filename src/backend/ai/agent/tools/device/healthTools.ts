import * as z from 'zod';

import {
  getHealthSummary,
  type HealthKitLoader,
  healthMetricNames,
  listHealthWorkouts,
} from '@/backend/services/device';
import { canUseDevicePermission, healthPermissionScope } from '@/shared/contracts';

import type { RuntimeTool } from '../../runtime';
import { createDeviceRuntimeTool, type DeviceToolDependencies } from './deviceRuntimeTool';
import { limit, optionalIsoDate } from './deviceToolSchemas';
import { createHealthDataTools } from './healthDataTools';

export const HEALTH_TOOL_IDS = {
  getSummary: 'health_get_summary',
  listWorkouts: 'health_list_workouts',
  listDataTypes: 'health_list_data_types',
  queryData: 'health_query_data',
  getRecord: 'health_get_record',
} as const;

/** Applied when the model passes the `0` sentinel for the workout limit. */
const DEFAULT_WORKOUT_LIMIT = 20;

const summarySchema = z
  .object({
    endDate: optionalIsoDate,
    granularity: z
      .enum(['summary', 'day'])
      .describe(
        'summary aggregates the requested range; day uses local calendar days on the device. Sleep crossing midnight is split across days, not grouped by wake-up date.',
      ),
    metrics: z
      .array(z.enum(healthMetricNames))
      .max(healthMetricNames.length)
      .describe(
        'An empty array selects all supported metrics. distance is walking/running meters, activeEnergy is active kilocalories, hrv is SDNN milliseconds. Heart metrics are averages. sleep is total asleep hours, excluding time merely in bed or awake; stages contains per-stage hours, including in-bed and awake time. Stages may overlap across sources and must not be added to recalculate sleep. Use health_list_data_types and health_query_data for other metrics.',
      ),
    startDate: optionalIsoDate,
  })
  .strict();

const workoutsSchema = z
  .object({
    endDate: optionalIsoDate,
    limit: limit(50).describe('Maximum records, newest first: 1–50; 0 uses 20.'),
    startDate: optionalIsoDate,
  })
  .strict();

export function createHealthTools(
  deps: DeviceToolDependencies,
  loadHealthKit?: HealthKitLoader,
): RuntimeTool[] {
  const tools = [
    createDeviceRuntimeTool({
      capabilityId: HEALTH_TOOL_IDS.getSummary,
      deps,
      description:
        'Read selected health metrics as a range summary or daily aggregates, up to 90 days. Empty endDate defaults to now; empty startDate defaults to seven days before endDate. Missing sleep means no readable asleep intervals, even if in-bed records exist. A metric with an error may have incomplete daily data; never infer zero from missing data.',
      displayName: 'Health summary',
      inputSchema: summarySchema,
      permissionScopes: (input) =>
        (input.metrics.length ? input.metrics : healthMetricNames).map(healthPermissionScope),
      permissionMatch: 'any',
      run: async (input, signal, permissions) => {
        const requested = input.metrics.length ? input.metrics : healthMetricNames;
        const metrics = requested.filter((metric) =>
          canUseDevicePermission(
            healthPermissionScope(metric),
            permissions[healthPermissionScope(metric)],
          ),
        );
        const result = await getHealthSummary(
          {
            endDate: input.endDate || undefined,
            granularity: input.granularity,
            metrics,
            startDate: input.startDate || undefined,
          },
          loadHealthKit,
          signal,
        );
        return {
          ...result,
          unavailableMetrics: requested.filter((metric) => !metrics.includes(metric)),
          accessNote:
            'Only available, authorized data is included. Missing data does not mean a zero value; HealthKit does not disclose read denials.',
        };
      },
    }),
    createDeviceRuntimeTool({
      capabilityId: HEALTH_TOOL_IDS.listWorkouts,
      deps,
      description:
        'List workouts overlapping a date range of at most 90 days, newest first, subject to system history access. Empty dates default to the last seven days. Returns data and hasMore; if hasMore is true, narrow the date range before claiming a complete count or total. Workout durations and totals cover whole workouts, including portions outside the range. Empty data may mean no records or no read access; never infer zero activity from it.',
      displayName: 'List workouts',
      inputSchema: workoutsSchema,
      permissionScopes: ['health.workouts.read'],
      run: (input) =>
        listHealthWorkouts({
          endDate: input.endDate || undefined,
          limit: input.limit || DEFAULT_WORKOUT_LIMIT,
          startDate: input.startDate || undefined,
        }),
    }),
    ...createHealthDataTools(deps),
  ];
  // Health questions are occasional, so these schemas load through tool_search, not every request.
  return tools.map((tool) => ({ ...tool, deferred: true }));
}
