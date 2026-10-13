import * as z from 'zod';

import {
  getHealthSummary,
  type HealthKitLoader,
  healthMetricNames,
  listHealthWorkouts,
} from '@/backend/services/device';
import { canUseDevicePermission, healthPermissionScope } from '@/shared/contracts';

import { createDeviceRuntimeTool, type DeviceToolDependencies } from './deviceRuntimeTool';
import { limit, optionalIsoDate } from './deviceToolSchemas';

export const HEALTH_TOOL_IDS = {
  getSummary: 'health_get_summary',
  listWorkouts: 'health_list_workouts',
} as const;

/** Applied when the model passes the `0` sentinel for the workout limit. */
const DEFAULT_WORKOUT_LIMIT = 20;

const summarySchema = z
  .object({
    endDate: optionalIsoDate,
    granularity: z.enum(['summary', 'day']),
    metrics: z.array(z.enum(healthMetricNames)).max(healthMetricNames.length),
    startDate: optionalIsoDate,
  })
  .strict();

const workoutsSchema = z
  .object({
    endDate: optionalIsoDate,
    limit: limit(50),
    startDate: optionalIsoDate,
  })
  .strict();

export function createHealthTools(deps: DeviceToolDependencies, loadHealthKit?: HealthKitLoader) {
  return [
    createDeviceRuntimeTool({
      capabilityId: HEALTH_TOOL_IDS.getSummary,
      deps,
      description:
        "Read selected Apple Health metrics as a range summary or daily aggregates for the user's health and fitness management. Requires explicit approval to share the results with the selected AI provider. Do not use this data for unrelated tasks or medical diagnosis.",
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
        "List Apple Health workouts for the user's fitness management from a date range of at most 90 days. Requires explicit approval to share results with the selected AI provider. An empty result may mean no records or no read access; never infer zero activity from it. Do not provide medical diagnosis.",
      displayName: 'List workouts',
      inputSchema: workoutsSchema,
      permissionScopes: ['health.workouts.read'],
      run: (input) =>
        listHealthWorkouts(
          {
            endDate: input.endDate || undefined,
            limit: input.limit || DEFAULT_WORKOUT_LIMIT,
            startDate: input.startDate || undefined,
          },
          loadHealthKit,
        ),
    }),
  ];
}
