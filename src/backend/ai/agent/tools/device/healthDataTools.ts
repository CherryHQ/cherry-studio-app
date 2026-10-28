import * as z from 'zod';

import {
  getHealthRecord,
  listHealthDataTypes,
  queryHealthData,
  resolveHealthDataType,
  type HealthDataReaderLoader,
} from '@/backend/services/device';
import {
  healthAuthorizationTypes,
  healthRecordSelectionType,
  HEALTH_TYPE_CATALOG,
} from '@/shared/contracts/health';
import { healthPermissionScope } from '@/shared/contracts/permissions';

import { createDeviceRuntimeTool, type DeviceToolDependencies } from './deviceRuntimeTool';
import { limit, optionalIsoDate } from './deviceToolSchemas';

const typeName = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (name) => Object.hasOwn(HEALTH_TYPE_CATALOG, name),
    'Use an exact type from health_list_data_types',
  )
  .describe(
    'Exact type from health_list_data_types, such as oxygenSaturation, bodyMass, sleep, bloodPressure or electrocardiogram.',
  );
const catalogSchema = z
  .object({
    query: z
      .string()
      .max(128)
      .describe('English identifier search, e.g. sleep, blood, dietary; empty searches all types.'),
    kind: z.enum([
      'all',
      'quantity',
      'category',
      'characteristic',
      'correlation',
      'assessment',
      'workout',
      'activitySummary',
      'route',
      'heartbeat',
      'electrocardiogram',
      'audiogram',
      'vision',
      'stateOfMind',
      'medication',
      'medicationDoseEvent',
    ]),
    offset: z.number().int().min(0).max(1000),
    limit: limit(200).describe('Maximum types, 1–200; 0 uses 50.'),
  })
  .strict();
const querySchema = z
  .object({
    type: typeName,
    mode: z
      .enum(['samples', 'statistics'])
      .describe(
        'samples reads original records; statistics uses HealthKit aggregation (cumulative sum or discrete average/min/max, plus most recent).',
      ),
    granularity: z
      .enum(['summary', 'day'])
      .describe('For statistics only; day uses local calendar days.'),
    startDate: optionalIsoDate,
    endDate: optionalIsoDate,
    limit: limit(200).describe(
      'Samples per page, 1–200; 0 uses 50. Not used by statistics or activity rings.',
    ),
    cursor: z
      .string()
      .max(16000)
      .describe(
        'Empty for the first page; otherwise nextCursor from the previous result. Keep explicit returned dates, type and workoutId unchanged.',
      ),
    workoutId: z
      .string()
      .max(36)
      .describe(
        'Optional workout UUID to restrict samples to that workout; empty means no workout filter.',
      ),
    reselectRecords: z
      .boolean()
      .describe(
        'Usually false. True reopens Apple’s selection for visionPrescription, userAnnotatedMedication or medicationDoseEvent, only when the user asks to change the shared records or medications.',
      ),
  })
  .strict();
const recordSchema = z
  .object({
    type: typeName,
    id: z.uuid().describe('Record UUID returned by a samples query.'),
    offset: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .describe('0 initially, then nextOffset. Series use point offsets; attachments use bytes.'),
    limit: limit(10_000).describe('Points or attachment bytes per page; 0 uses 1000.'),
    attachmentId: z
      .string()
      .max(36)
      .describe(
        'Empty to read the record and list attachments; otherwise an attachment UUID from that record. Attachment data is returned as base64 bytes.',
      ),
  })
  .strict();

export function createHealthDataTools(deps: DeviceToolDependencies, load?: HealthDataReaderLoader) {
  return [
    createDeviceRuntimeTool({
      capabilityId: 'health_list_data_types',
      deps,
      displayName: 'Health data types',
      description:
        'Discover public HealthKit types, supported iOS versions and numeric value meanings. This only reads the type catalog, not personal health records. Use it before querying an unfamiliar metric. A type being available is not a read grant. No public sleep-score API is available.',
      inputSchema: catalogSchema,
      permissionScopes: [],
      run: (input) => listHealthDataTypes({ ...input, limit: input.limit || 50 }, load),
    }),
    createDeviceRuntimeTool({
      capabilityId: 'health_query_data',
      deps,
      displayName: 'Read health data',
      description:
        'Read any supported HealthKit type after user approval. Empty dates select the last seven days; at most 90 days. Use quantity statistics for totals and heart-rate min/max; samples for curves, sleep stages, nutrition, symptoms, reproductive health, blood-pressure pairs, ECG summaries and more. Sample pages are not chronological; continue nextCursor before claiming completeness. Characteristics and the medication list are current values without date filtering; activity rings cover complete calendar days. Percent values are fractions (0.97 = 97%). ECG voltage, routes, heartbeat and quantity series are read with health_get_record. Empty data cannot distinguish no records from denied read access.',
      inputSchema: querySchema,
      permissionScopes: (input) => [
        ...healthAuthorizationTypes(resolveHealthDataType(input.type)).map(healthPermissionScope),
        ...(input.workoutId ? [healthPermissionScope('workouts')] : []),
      ],
      run: async (input, signal) => {
        if (input.reselectRecords) {
          const selectionType = healthRecordSelectionType(resolveHealthDataType(input.type));
          if (!selectionType)
            throw new Error(
              'Only vision prescriptions and medications support record reselection.',
            );
          await deps.devicePermissions.request([healthPermissionScope(selectionType)], signal, {
            reselectHealthRecords: true,
          });
          signal.throwIfAborted();
        }
        return queryHealthData(
          {
            ...input,
            startDate: input.startDate || undefined,
            endDate: input.endDate || undefined,
            limit: input.limit || 50,
          },
          load,
        );
      },
    }),
    createDeviceRuntimeTool({
      capabilityId: 'health_get_record',
      deps,
      displayName: 'Health record details',
      description:
        'Read details of an authorized HealthKit sample by its type and UUID. Returns paged ECG microvolt measurements, heartbeat timing/gaps, route coordinates, quantity series or attachment bytes, plus source metadata. Follow nextOffset until complete. Never infer a missing value is zero or treat ECG classifications as a diagnosis.',
      inputSchema: recordSchema,
      permissionScopes: (input) =>
        healthAuthorizationTypes(resolveHealthDataType(input.type)).map(healthPermissionScope),
      run: (input, signal) =>
        getHealthRecord({ ...input, limit: input.limit || 1000 }, load, signal),
    }),
  ];
}
