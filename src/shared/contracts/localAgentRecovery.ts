/** Process-local availability, deliberately separate from the Agent wire protocol. */
export type LocalAgentRecoveryStatus =
  | {
      kind: 'blocked';
      executions: { sessionId: string; assistantMessageId: string; turnId: string }[];
      admissions: number;
    }
  | { kind: 'unavailable'; reason: 'claim-failed' | 'blocked' }
  | undefined;

export interface LocalAgentRecovery {
  localRecoveryStatus(): LocalAgentRecoveryStatus;
  subscribeLocalRecoveryStatus(listener: () => void): () => void;
  resetBlockedAgentState(): Promise<void>;
}
