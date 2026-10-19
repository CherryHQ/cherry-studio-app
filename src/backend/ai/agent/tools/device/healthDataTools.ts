import * as z from 'zod';

import {
  getHealthRecord,
  listHealthDataTypes,
  queryHealthData,
  resolveHealthDataType,
  shareVerifiableHealthRecords,
  type HealthDataReaderLoader,
} from '@/backend/services/device';
import { healthAuthorizationTypes, HEALTH_TYPE_CATALOG } from '@/shared/contracts/health';
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
      'document',
      'clinical',
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
        'Usually false. True opens Apple’s record selection again for vision prescriptions, only when the user asks to select more records.',
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
      .describe(
        '0 initially, then nextOffset. Series use point offsets; text uses Unicode scalars; attachments use bytes.',
      ),
    limit: limit(10_000).describe(
      'Points, text scalars or attachment bytes per page; 0 uses 1000.',
    ),
    attachmentId: z
      .string()
      .max(36)
      .describe(
        'Empty to read the record and list attachments; otherwise an attachment UUID from that record. Attachment data is returned as base64 bytes.',
      ),
  })
  .strict();

const verifiableSchema = z
  .object({
    recordTypes: z
      .array(z.enum(['covid19', 'immunization', 'laboratory', 'recovery']))
      .min(1)
      .max(4)
      .describe(
        'Required credential types, combined with AND; use immunization alone for any immunization, or covid19 plus immunization for COVID-19 immunizations.',
      ),
    sourceTypes: z
      .array(z.enum(['smartHealthCard', 'euDigitalCOVIDCertificate']))
      .min(1)
      .max(2),
    offset: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .describe('Selected-record offset; 0 initially.'),
    limit: limit(50).describe('Records per page; 0 uses 20.'),
    dataOffset: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .describe('Payload byte offset for each selected record; 0 initially.'),
    dataLimit: limit(10_000).describe('Payload bytes per record; 0 uses 1000.'),
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
        'Read any supported HealthKit type after user approval. Empty dates select the last seven days; at most 90 days. Use quantity statistics for totals and heart-rate min/max; samples for curves, sleep stages, nutrition, symptoms, reproductive health, blood-pressure pairs, clinical records, ECG summaries and more. Sample pages are not chronological; continue nextCursor before claiming completeness. Characteristics and the medication list are current values without date filtering; activity rings cover complete calendar days. Percent values are fractions (0.97 = 97%). Clinical FHIR content, CDA documents, ECG voltage, routes, heartbeat and quantity series are read with health_get_record. Empty data cannot distinguish no records from denied read access.',
      inputSchema: querySchema,
      permissionScopes: (input) => [
        ...healthAuthorizationTypes(resolveHealthDataType(input.type)).map(healthPermissionScope),
        ...(input.workoutId ? [healthPermissionScope('workouts')] : []),
      ],
      run: async (input, signal) => {
        if (input.reselectRecords) {
          if (input.type !== 'visionPrescription')
            throw new Error('Only vision prescriptions support record reselection.');
          await deps.devicePermissions.request(
            [healthPermissionScope('visionPrescription')],
            signal,
            { reselectHealthRecords: true },
          );
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
        'Read details of an authorized HealthKit sample by its type and UUID. Returns paged ECG microvolt measurements, heartbeat timing/gaps, route coordinates, quantity series, clinical FHIR JSON, CDA XML or attachment bytes, plus source metadata. Follow nextOffset until complete. CDA may open Apple’s per-document selection sheet. Never infer a missing value is zero or treat clinical/ECG classifications as a diagnosis.',
      inputSchema: recordSchema,
      permissionScopes: (input) =>
        healthAuthorizationTypes(resolveHealthDataType(input.type)).map(healthPermissionScope),
      run: (input) => getHealthRecord({ ...input, limit: input.limit || 1000 }, load),
    }),
    createDeviceRuntimeTool({
      capabilityId: 'health_share_verifiable_records',
      deps,
      displayName: 'Share verifiable health records',
      description:
        'Request one-time user-selected SMART Health Cards or EU Digital COVID Certificates. Requires a separate Apple-approved restricted entitlement in the installed app; ordinary HealthKit authorization is insufficient. Every call opens the system selection sheet, including pagination: select the same records to continue offsets. No date filter. Returns record metadata and paged base64 signed payloads, without verifying signatures or issuer trust. Use only when the user asks to share these credentials.',
      inputSchema: verifiableSchema,
      // This query presents its own consent sheet; there is no persistent type-level read grant.
      permissionScopes: [],
      run: (input) =>
        shareVerifiableHealthRecords(
          {
            ...input,
            limit: input.limit || 20,
            dataLimit: input.dataLimit || 1000,
          },
          load,
        ),
    }),
  ];
}
