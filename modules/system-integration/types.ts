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
  onBackgroundTaskActionPending: () => void;
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
    actions?: {
      /** Connection notices remain ordinary ongoing notifications, separate from task Live Updates. */
      promoted?: boolean;
      /** The persistent PC connection is the summary of its device's notifications. */
      groupSummary?: boolean;
      token: string;
      prompt: string;
      buttons: { id: string; label: string }[];
      reply?: { label: string; placeholder: string; choices: string[] };
    } | null,
  ): Promise<void>;
  drainBackgroundTaskActions?(): Promise<{ token: string; actionId: string; text?: string }[]>;
  dismissBackgroundTaskNotification?(id: number): Promise<void>;
  /** Ungroups children before removal of a service summary, retaining delivered results. */
  detachBackgroundTaskNotificationGroup?(id: number): Promise<void>;
  dismissCompletedBackgroundTaskNotification?(key: string): Promise<void>;
  clearBackgroundTaskNotifications?(): Promise<void>;
}
