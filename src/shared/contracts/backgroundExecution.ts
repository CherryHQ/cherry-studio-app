export type BackgroundExecutionStatus = 'idle' | 'starting' | 'active' | 'limited' | 'interrupted';

export type BackgroundRunSettings = {
  batteryOptimizationExempt: boolean | null;
  lowPowerMode: boolean;
  liveActivitiesEnabled: boolean | null;
  manufacturer: string;
};

/** Execution admission and device restrictions are independent of notification preferences. */
export interface BackgroundExecutionModule {
  getStatus(): BackgroundExecutionStatus;
  subscribe(listener: () => void): () => void;
  getSettings(): Promise<BackgroundRunSettings | null>;
  openSettings(): Promise<void>;
}
