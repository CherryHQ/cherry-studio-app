/** This is a real native transport boundary. Do not move envelopes into Backend contracts. */
export type NativeSystemEntry = {
  version: 1;
  id: string;
  createdAt: number;
  kind: 'share.receive';
  text: string;
  files: { name: string; uri: string; mediaType: string; size: number }[];
};

type NativeSystemEvents = {
  onPending: () => void;
  onBackgroundExecutionExpired: (event: { id: string }) => void;
};

/**
 * Expo exports `NativeModule` as the constructor type, so extending it inherits statics rather
 * than the emitter instance members, and drops the events map. Declare the one member consumed
 * here so each event payload stays typed.
 */
export interface SystemIntegrationNativeModule {
  addListener<EventName extends keyof NativeSystemEvents>(
    eventName: EventName,
    listener: NativeSystemEvents[EventName],
  ): { remove(): void };
  claimNextEntry(): Promise<NativeSystemEntry | null>;
  releaseEntry(id: string): Promise<void>;
  completeEntry(id: string): Promise<void>;
  getBackgroundRunSettings?(): Promise<{
    batteryOptimizationExempt: boolean | null;
    lowPowerMode: boolean;
    liveActivitiesEnabled: boolean | null;
    manufacturer: string;
  }>;
  openBackgroundRunSettings?(): Promise<void>;
  /** iOS-only finite execution window; it does not enable a background mode. */
  beginBackgroundExecution?(id: string): Promise<boolean>;
  endBackgroundExecution?(id: string): Promise<void>;
  /** Android-only notification transport, sharing IDs with the foreground service. */
  getBackgroundTaskNotificationId?(key: string): number;
  showBackgroundTaskNotification?(
    id: number,
    title: string,
    body: string,
    url: string | null,
    ongoing: boolean,
    alert: boolean,
    channelName: string,
  ): Promise<void>;
  dismissBackgroundTaskNotification?(id: number): Promise<void>;
  dismissCompletedBackgroundTaskNotification?(key: string): Promise<void>;
  clearBackgroundTaskNotifications?(): Promise<void>;
}
