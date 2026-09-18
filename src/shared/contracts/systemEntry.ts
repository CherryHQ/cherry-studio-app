export type SystemAction =
  | { kind: 'chat.open'; agentId?: string }
  | { kind: 'chat.ask'; agentId?: string; text: string }
  | { kind: 'painting.open' }
  | {
      kind: 'share.receive';
      text: string;
      files: readonly { id: string; name: string; mediaType: string; size: number }[];
    };

/** The app shell owns a claimed action until completion, dismissal, or disposal. */
export interface SystemEntrySession {
  readonly action: SystemAction;
  /** Settles after handoff, dismissal, or the reply to a native ask finishes. */
  readonly settled: Promise<void>;
  resolveAgent(): Promise<string | null>;
  /** Share calls require an explicit user confirmation; asks already carry native intent consent. */
  submit(agentId: string): Promise<{ sessionId: string }>;
  /** The destination has consumed this action. */
  complete(): Promise<void>;
  dismiss(): Promise<void>;
  /** Cancels an owned ask; releases an unconsumed ordinary share for the next foreground pass. */
  dispose(): Promise<void>;
}

export interface SystemEntryModule {
  subscribePending(listener: () => void): () => void;
  claimNext(): Promise<SystemEntrySession | null>;
  /** Available when native shortcuts consume an Agent index, refreshed from authoritative app data. */
  refreshShortcuts?(): Promise<void>;
}
