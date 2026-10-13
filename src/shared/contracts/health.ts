import type { HealthDataType } from './permissions';

export type HealthOverview =
  | { state: 'unavailable'; reason: 'unsupported' | 'native-unavailable' }
  | { state: 'access-required'; canRequest: boolean }
  | {
      state: 'ready';
      startDate: string;
      endDate: string;
      metrics: {
        type: Exclude<HealthDataType, 'workouts'>;
        unit: string;
        value: number | null;
        state: 'available' | 'no-data' | 'error';
      }[];
    };

/** Reads the last seven days locally, without requesting access or invoking AI. */
export interface HealthModule {
  getOverview(signal?: AbortSignal): Promise<HealthOverview>;
}
