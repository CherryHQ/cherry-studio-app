import type { FileEntryId } from '@/shared/data/types/file';
import type {
  SaveSshProfile,
  SshCommandResult,
  SshCommandInput,
  SshFileRequest,
  SshFileResult,
  SshAuthenticationRequest,
  SshTransferProgress,
  SshOutput,
  SshProfile,
  SshReference,
  SshTarget,
} from '@/shared/data/types/ssh';

import type { ResolvedFile } from './file';

export type SshHostProbe = { token: string; fingerprint: string };
export interface SshModule {
  isAvailable(): boolean;
  save(input: SaveSshProfile): Promise<SshProfile>;
  remove(reference: SshReference): Promise<void>;
  probe(reference: SshReference, signal: AbortSignal): Promise<SshHostProbe>;
  trust(token: string): Promise<SshProfile>;
  execute(
    reference: SshReference,
    input: SshCommandInput,
    signal: AbortSignal,
    onOutput?: (output: SshOutput) => void,
  ): Promise<SshCommandResult>;
  files(
    reference: SshReference,
    input: SshFileRequest,
    signal: AbortSignal,
  ): Promise<SshFileResult>;
  download(
    reference: SshReference,
    path: string,
    signal: AbortSignal,
    onProgress?: (progress: SshTransferProgress) => void,
  ): Promise<ResolvedFile>;
  upload(
    reference: SshReference,
    input: { path: string; fileEntryId: FileEntryId; overwrite: boolean },
    signal: AbortSignal,
    onProgress?: (progress: SshTransferProgress) => void,
  ): Promise<SshFileResult>;
  getAuthenticationRequests(): readonly SshAuthenticationRequest[];
  subscribeAuthentication(listener: () => void): () => void;
  respondAuthentication(id: string, responses: readonly string[] | null): void;
  selectTarget(sessionId: string, reference: SshReference | null): Promise<void>;
  /** Returns the exact new authorization so a failed approval can revoke only its own grant. */
  setCommandGrant(
    sessionId: string,
    expected: SshTarget,
    allowCommands: boolean,
  ): Promise<SshTarget>;
  /** Copies a user-selected draft binding to the session allocated by its first send. */
  attachDraftTarget(draftId: string, sessionId: string): Promise<void>;
  getTarget(sessionId: string): SshTarget | null;
  subscribeTargets(listener: () => void): () => void;
}
