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
}
