import { tool } from 'ai';
import * as z from 'zod';

import {
  getHealthSummary,
  type HealthKitLoader,
  healthMetricNames,
  listHealthWorkouts,
} from '../../../device/health';
import {
  createDeviceToolEntry,
  type DeviceToolDependencies,
  deviceToolErrorSchema,
  deviceToolModelOutput,
  runDeviceTool,
} from './deviceToolSupport';
import { healthSummaryOutputSchema, workoutOutputSchema } from './outputSchemas';
import { DEVICE_TOOL_NAMES } from './toolNames';

const dateOrEmpty = z.union([z.literal(''), z.string().datetime({ offset: true })]);
const result = <T extends z.ZodType>(schema: T) => z.union([schema, deviceToolErrorSchema]);

export function createHealthToolEntries(
  deps: DeviceToolDependencies,
  loadHealthKit?: HealthKitLoader,
) {
  return [
    createDeviceToolEntry({
      deps,
      description: 'Read selected health metrics as a range summary or daily aggregates.',
      name: DEVICE_TOOL_NAMES.healthGetSummary,
      namespace: 'health',
      preferenceKeys: ['permissions.health_read'],
      tool: tool({
        description: 'Read selected health metrics as a range summary or daily aggregates.',
        inputSchema: z
          .object({
            endDate: dateOrEmpty,
            granularity: z.enum(['summary', 'day']),
            metrics: z.array(z.enum(healthMetricNames)).max(healthMetricNames.length),
            startDate: dateOrEmpty,
          })
          .strict(),
        outputSchema: result(healthSummaryOutputSchema),
        strict: true,
        execute: async (input, options) =>
          runDeviceTool(
            () =>
              getHealthSummary(
                {
                  endDate: input.endDate || undefined,
                  granularity: input.granularity,
                  metrics: input.metrics.length ? input.metrics : undefined,
                  startDate: input.startDate || undefined,
                },
                loadHealthKit,
              ),
            options,
          ),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
    createDeviceToolEntry({
      deps,
      description: 'List workouts from a date range of at most 90 days.',
      name: DEVICE_TOOL_NAMES.healthListWorkouts,
      namespace: 'health',
      preferenceKeys: ['permissions.health_read'],
      tool: tool({
        description: 'List workouts from a date range of at most 90 days.',
        inputSchema: z
          .object({
            endDate: dateOrEmpty,
            limit: z
              .number()
              .int()
              .refine((value) => value === 0 || (value >= 1 && value <= 50)),
            startDate: dateOrEmpty,
          })
          .strict(),
        outputSchema: result(z.array(workoutOutputSchema)),
        strict: true,
        execute: async (input, options) =>
          runDeviceTool(
            () =>
              listHealthWorkouts(
                {
                  endDate: input.endDate || undefined,
                  limit: input.limit || 20,
                  startDate: input.startDate || undefined,
                },
                loadHealthKit,
              ),
            options,
          ),
        toModelOutput: ({ output }) => deviceToolModelOutput(output),
      }),
    }),
  ];
}
