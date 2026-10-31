import type {
  SaveSshProfile,
  SshCommandResult,
  SshOutput,
  SshProfile,
  SshReference,
  SshTarget,
} from '@/shared/data/types/ssh';

export type SshHostProbe = { token: string; fingerprint: string };
export interface SshModule {
  isAvailable(): boolean;
  save(input: SaveSshProfile): Promise<SshProfile>;
  remove(reference: SshReference): Promise<void>;
  probe(reference: SshReference, signal: AbortSignal): Promise<SshHostProbe>;
  trust(token: string): Promise<SshProfile>;
  execute(
    reference: SshReference,
    command: string,
    signal: AbortSignal,
    onOutput?: (output: SshOutput) => void,
  ): Promise<SshCommandResult>;
  selectTarget(sessionId: string, reference: SshReference | null): Promise<void>;
  setCommandGrant(sessionId: string, expected: SshTarget, allowCommands: boolean): Promise<void>;
  /** Copies a user-selected draft binding to the session allocated by its first send. */
  attachDraftTarget(draftId: string, sessionId: string): Promise<void>;
  getTarget(sessionId: string): SshTarget | null;
  subscribeTargets(listener: () => void): () => void;
}
