export type SystemAction = {
  kind: 'share.receive';
  text: string;
  files: readonly { id: string; name: string; mediaType: string; size: number }[];
};

/** The app shell owns a claimed action until completion, dismissal, or disposal. */
export interface SystemEntrySession {
  readonly action: SystemAction;
  /** Settles after submission, dismissal, or disposal. */
  readonly settled: Promise<void>;
  /** Requires explicit user confirmation from the share review. */
  submit(agentId: string): Promise<{ sessionId: string }>;
  dismiss(): Promise<void>;
  /** Releases an unconsumed share for the next foreground pass. */
  dispose(): Promise<void>;
}

export interface SystemEntryModule {
  subscribePending(listener: () => void): () => void;
  claimNext(): Promise<SystemEntrySession | null>;
}
