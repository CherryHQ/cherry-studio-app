import {
  HEALTH_DATA_TYPES,
  HEALTH_TYPE_CATALOG,
  type HealthDataType,
} from '@/shared/contracts/health';
import { HEALTH_ENUM_VALUES } from '@/shared/contracts/healthValues';

import type {
  HealthQueryOptions,
  HealthRecordOptions,
  HealthVerifiableRecordOptions,
} from '../../../../modules/health-access';
import { normalizeOptionalDateRange, withNativeToolTimeout } from './utils';

type Reader = ReturnType<typeof import('../../../../modules/health-access').getHealthDataReader>;
export type HealthDataReaderLoader = () => Promise<Reader>;
export const loadHealthDataReader: HealthDataReaderLoader = async () =>
  (await import('../../../../modules/health-access')).getHealthDataReader();

const ACCESS_NOTE =
  'Only readable records are returned. HealthKit does not disclose read denials; missing data is not zero. Values with unit % are HealthKit fractions: 0.97 means 97%.';

export function resolveHealthDataType(value: string): HealthDataType {
  if (!Object.hasOwn(HEALTH_TYPE_CATALOG, value))
    throw new Error(
      `Unsupported health type: ${value}. Use health_list_data_types to find a type.`,
    );
  return value as HealthDataType;
}

export async function listHealthDataTypes(
  input: { query: string; kind: string; offset: number; limit: number },
  load: HealthDataReaderLoader = loadHealthDataReader,
) {
  const search = input.query.trim().toLowerCase();
  const types = HEALTH_DATA_TYPES.filter((name) => {
    const spec = HEALTH_TYPE_CATALOG[name];
    return (
      (input.kind === 'all' || spec.kind === input.kind) &&
      `${name} ${spec.identifier}`.toLowerCase().includes(search)
    );
  }).sort();
  const page = types.slice(input.offset, input.offset + input.limit);
  const available = await (await load()).getTypeAvailability(page);
  return {
    data: page.map((type) => ({
      type,
      ...HEALTH_TYPE_CATALOG[type],
      available: available[type]?.available ?? false,
      identifier: available[type]?.identifier ?? HEALTH_TYPE_CATALOG[type].identifier,
      valueDefinitions: valueDefinitions(type),
    })),
    total: types.length,
    nextOffset: input.offset + page.length < types.length ? input.offset + page.length : null,
    note: 'Availability means the current iOS supports the type, not that records exist or read access was granted. Statistics are only for quantity types. No public HealthKit sleep-score type is exposed.',
    documentation: 'https://developer.apple.com/documentation/healthkit/data-types',
    additionalReadTools: [
      {
        tool: 'health_share_verifiable_records',
        description:
          'SMART Health Cards and EU Digital COVID Certificates use one-time selection instead of ordinary type authorization. Requires a separate Apple-approved restricted entitlement.',
      },
    ],
  };
}

export async function queryHealthData(
  input: {
    type: string;
    startDate?: string;
    endDate?: string;
    limit: number;
    cursor: string;
    mode: HealthQueryOptions['mode'];
    granularity: HealthQueryOptions['granularity'];
    workoutId: string;
    reselectRecords: boolean;
  },
  load: HealthDataReaderLoader = loadHealthDataReader,
) {
  const type = resolveHealthDataType(input.type);
  const spec = HEALTH_TYPE_CATALOG[type];
  if (input.mode === 'statistics' && spec.kind !== 'quantity')
    throw new Error('Statistics require a quantity type. Use samples for this type.');
  if (input.mode === 'statistics' && input.cursor)
    throw new Error('Statistics do not use a cursor.');
  if (input.workoutId && ['characteristic', 'activitySummary', 'medication'].includes(spec.kind))
    throw new Error('Workout filtering only applies to sample types.');
  if (input.reselectRecords && spec.kind !== 'vision')
    throw new Error(
      'reselectRecords applies only to vision prescriptions. CDA documents request selection when their details are read.',
    );
  const range = normalizeOptionalDateRange(input.startDate, input.endDate);
  const reader = await load();
  const result = await withNativeToolTimeout(
    reader.query(type, {
      ...input,
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
    }),
    'Health data query',
    30_000,
  );
  return {
    ...result,
    type,
    identifier: result.identifier ?? spec.identifier,
    startDate: range.start.toISOString(),
    endDate: range.end.toISOString(),
    valueDefinitions: valueDefinitions(type),
    accessNote: ACCESS_NOTE,
    intervalNote:
      result.intervalNote ??
      (input.mode === 'statistics'
        ? 'HealthKit aggregates samples matching the interval; daily rows follow local calendar boundaries.'
        : 'Samples overlap the requested interval and retain their original start/end dates and values. They are not clipped or prorated. Raw samples can overlap across sources; use statistics for quantity totals.'),
  };
}

export async function getHealthRecord(
  input: HealthRecordOptions & { type: string },
  load: HealthDataReaderLoader = loadHealthDataReader,
) {
  const type = resolveHealthDataType(input.type);
  const result = await withNativeToolTimeout(
    (await load()).getRecord(type, input),
    'Health record query',
    type === 'cdaDocument' ? 210_000 : 60_000,
  );
  return { ...result, type, valueDefinitions: valueDefinitions(type), accessNote: ACCESS_NOTE };
}

export async function shareVerifiableHealthRecords(
  input: HealthVerifiableRecordOptions,
  load: HealthDataReaderLoader = loadHealthDataReader,
) {
  return withNativeToolTimeout(
    (await load()).shareVerifiableRecords(input),
    'Verifiable health record sharing',
    210_000,
  );
}

function valueDefinitions(type: HealthDataType) {
  const spec = HEALTH_TYPE_CATALOG[type];
  const enums: Record<string, string> =
    'categoryValues' in spec ? { value: spec.categoryValues } : {};
  const additional: Partial<Record<HealthDataType, Record<string, string>>> = {
    biologicalSex: { value: 'HKBiologicalSex' },
    bloodType: { value: 'HKBloodType' },
    fitzpatrickSkinType: { value: 'HKFitzpatrickSkinType' },
    wheelchairUse: { value: 'HKWheelchairUse' },
    activityMoveMode: { value: 'HKActivityMoveMode' },
    workouts: { activityType: 'HKWorkoutActivityType' },
    electrocardiogram: {
      classification: 'HKElectrocardiogramClassification',
      symptomsStatus: 'HKElectrocardiogramSymptomsStatus',
    },
    stateOfMind: {
      kind: 'HKStateOfMindKind',
      valenceClassification: 'HKStateOfMindValenceClassification',
      labels: 'HKStateOfMindLabel',
      associations: 'HKStateOfMindAssociation',
    },
    medicationDoseEvent: {
      logStatus: 'HKMedicationDoseEventLogStatus',
      scheduleType: 'HKMedicationDoseEventScheduleType',
    },
    gad7: { risk: 'HKGAD7AssessmentRisk', answers: 'HKGAD7AssessmentAnswer' },
    phq9: { risk: 'HKPHQ9AssessmentRisk', answers: 'HKPHQ9AssessmentAnswer' },
  };
  return Object.fromEntries(
    Object.entries({ ...enums, ...additional[type] }).map(([field, name]) => [
      field,
      HEALTH_ENUM_VALUES[name] ?? {},
    ]),
  );
}
