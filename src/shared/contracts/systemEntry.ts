export type SystemAction =
  | { kind: 'chat.open'; agentId?: string }
  | { kind: 'chat.ask'; agentId?: string; text: string }
  | { kind: 'painting.open' }
  | {
      kind: 'share.receive';
      text: string;
      files: readonly { id: string; name: string; mediaType: string; size: number }[];
    }
  | { kind: 'translation.translate'; text: string; targetLanguage?: string };

export type SystemEntryCapabilities = {
  shares: boolean;
  translationWindow: boolean;
  translationProvider: boolean;
  shortcuts: boolean;
};

/** The app shell owns a claimed action until completion, dismissal, or disposal. */
export interface SystemEntrySession {
  readonly action: SystemAction;
  /** Settles after handoff, dismissal, or the reply to a native ask finishes. */
  readonly settled: Promise<void>;
  resolveAgent(): Promise<string | null>;
  /** Share calls require an explicit user confirmation; asks already carry native intent consent. */
  submit(agentId: string): Promise<{ sessionId: string }>;
  /** A navigation or temporary translation handoff has consumed this action. */
  complete(): Promise<void>;
  dismiss(): Promise<void>;
  /** Cancels an owned ask; releases an unconsumed ordinary share for the next foreground pass. */
  dispose(): Promise<void>;
}

export interface SystemEntryModule {
  getCapabilities(): SystemEntryCapabilities;
  subscribePending(listener: () => void): () => void;
  claimNext(): Promise<SystemEntrySession | null>;
  /** Refreshes the native Agent index from authoritative app data, without exposing a data write API. */
  refreshShortcuts(): Promise<void>;
}
