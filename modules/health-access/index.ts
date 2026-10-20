import { requireOptionalNativeModule } from 'expo';

import {
  healthAuthorizationTypes,
  HEALTH_TYPE_CATALOG,
  type HealthDataType,
} from '@/shared/contracts/health';
import type { DevicePermissionStatus } from '@/shared/contracts/permissions';

type TypeDescriptor = {
  name: HealthDataType;
  identifier: string;
  kind: string;
  minimumIOS: string;
};
type AuthorizedTypeDescriptor = TypeDescriptor & { authorization: TypeDescriptor[] };

export type HealthQueryOptions = {
  startDate: string;
  endDate: string;
  limit: number;
  cursor: string;
  mode: 'samples' | 'statistics';
  granularity: 'summary' | 'day';
  workoutId: string;
};
export type HealthRecordOptions = {
  id: string;
  offset: number;
  limit: number;
  attachmentId: string;
};
export type HealthDataResult = Record<string, unknown>;
export type HealthVerifiableRecordOptions = {
  recordTypes: ('covid19' | 'immunization' | 'laboratory' | 'recovery')[];
  sourceTypes: ('smartHealthCard' | 'euDigitalCOVIDCertificate')[];
  offset: number;
  limit: number;
  dataOffset: number;
  dataLimit: number;
};
export type HealthWorkout = {
  id: string;
  activityType: number;
  durationSeconds: number;
  startDate: string;
  endDate: string;
  totalDistanceMeters: number | null;
  totalEnergyKilocalories: number | null;
};

type NativeHealthAccessModule = {
  getAvailability(): Promise<'available' | 'unsupported'>;
  getStatuses(types: AuthorizedTypeDescriptor[]): Promise<Record<string, DevicePermissionStatus>>;
  request(types: AuthorizedTypeDescriptor[]): Promise<Record<string, DevicePermissionStatus>>;
  getTypeAvailability(
    types: TypeDescriptor[],
  ): Promise<Record<string, { available: boolean; identifier: string | null }>>;
  query(type: TypeDescriptor, options: HealthQueryOptions): Promise<HealthDataResult>;
  getRecord(type: TypeDescriptor, options: HealthRecordOptions): Promise<HealthDataResult>;
  listWorkouts(startDate: string, endDate: string, limit: number): Promise<HealthWorkout[]>;
  shareVerifiableRecords(options: HealthVerifiableRecordOptions): Promise<HealthDataResult>;
};

export type HealthAccessModule = {
  getAvailability(): Promise<'available' | 'unsupported'>;
  getStatuses(
    types: readonly HealthDataType[],
  ): Promise<Partial<Record<HealthDataType, DevicePermissionStatus>>>;
  request(
    types: readonly HealthDataType[],
  ): Promise<Partial<Record<HealthDataType, DevicePermissionStatus>>>;
};

function describeType(name: HealthDataType): TypeDescriptor {
  const spec = HEALTH_TYPE_CATALOG[name];
  return { name, ...spec, identifier: spec.identifier ?? '' };
}

function describeAuthorization(name: HealthDataType): AuthorizedTypeDescriptor {
  return { ...describeType(name), authorization: healthAuthorizationTypes(name).map(describeType) };
}

export function getHealthAccess(): HealthAccessModule | null {
  const native = requireOptionalNativeModule<NativeHealthAccessModule>('HealthAccess');
  if (!native) return null;
  return {
    getAvailability: () => native.getAvailability(),
    getStatuses: (types) => native.getStatuses(types.map(describeAuthorization)),
    request: (types) => native.request(types.map(describeAuthorization)),
  };
}

export function getHealthDataReader() {
  const native = requireOptionalNativeModule<NativeHealthAccessModule>('HealthAccess');
  if (!native?.query)
    throw new Error('Health data reader is unavailable. Install a new iOS development build.');
  return {
    getTypeAvailability: (types: HealthDataType[]) =>
      native.getTypeAvailability(types.map(describeType)),
    query: (type: HealthDataType, options: HealthQueryOptions) =>
      native.query(describeType(type), options),
    getRecord: (type: HealthDataType, options: HealthRecordOptions) =>
      native.getRecord(describeType(type), options),
    listWorkouts: (startDate: string, endDate: string, limit: number) =>
      native.listWorkouts(startDate, endDate, limit),
    shareVerifiableRecords: (options: HealthVerifiableRecordOptions) =>
      native.shareVerifiableRecords(options),
  };
}
