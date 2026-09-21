/** This is a real native transport boundary. Do not move envelopes into Backend contracts. */
export type NativeTranslationConfiguration = {
  version: 2;
  revision: string;
  modelId: string;
  modelName: string;
  providerName: string;
  endpoint: string;
  wireModelId: string;
  targetLanguage: string;
  interfaceLanguage: string;
  promptTemplate: string;
  requestParameters: Record<string, unknown>;
};

export type NativeSystemEntry = {
  version: 1;
  id: string;
  createdAt: number;
  kind: 'chat.open' | 'chat.ask' | 'painting.open' | 'share.receive';
  agentId?: string;
  text?: string;
  files?: { name: string; uri: string; mediaType: string; size: number }[];
  /** Only the native App Intent implementation can grant this capability. */
  replyExpected?: boolean;
};

type NativeSystemEvents = {
  onPending: () => void;
  onIntentCancelled: (event: { id: string }) => void;
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
  getCapabilities(): {
    translationWindow: boolean;
    translationProvider: boolean;
    translationShortcut: boolean;
    shortcuts: boolean;
  };
  invalidateTranslationConfiguration(): Promise<void>;
  publishTranslationConfiguration(
    configuration: NativeTranslationConfiguration,
    apiKey: string,
  ): Promise<void>;
  publishTranslationUnavailable(configuration: {
    version: 1;
    reason: string;
    modelName?: string;
    providerName?: string;
    targetLanguage: string;
    interfaceLanguage: string;
  }): Promise<void>;
  getTranslationRevision(): Promise<string | null>;
  claimNextEntry(): Promise<NativeSystemEntry | null>;
  releaseEntry(id: string): Promise<void>;
  completeEntry(id: string): Promise<void>;
  finishIntent(
    id: string,
    result: { status: 'succeeded' | 'failed'; text?: string },
  ): Promise<void>;
  /** iOS App Intents read this index; Android launcher shortcuts do not use it. */
  publishAgents?(agents: { id: string; name: string }[]): Promise<void>;
}
