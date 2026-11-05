import type { DirectEndpoint } from '@cherrystudio/remote-protocol';

import type {
  DesktopConnectionFailure,
  DesktopImportPreview,
  DesktopPairingClaim,
  DesktopImportResult,
  DesktopImportSelectionsDto,
  PairDesktopConnectionDto,
} from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

export type DesktopLiveStatus =
  | { state: 'connected' }
  | { state: 'connecting' }
  | { state: 'reconnecting'; retry: number }
  | { state: 'disconnected' }
  | {
      state: 'unreachable';
      reason: 'no-location' | 'discovery-unavailable' | 'unreachable';
      failures?: DesktopConnectionFailure[];
    }
  | { state: 'needs-repair'; reason: 'unauthenticated' | 'revoked' }
  | { state: 'unsupported'; message?: string };

export type DesktopPairingProgress =
  | { stage: 'connecting' | 'requesting' | 'saving' | 'syncing' }
  | { stage: 'waiting'; claim: DesktopPairingClaim };

/** Sync enabled PC provider configuration; add missing enabled models and preserve existing models. */
export interface DesktopConnectionsModule {
  /** Explicitly resumes a user-disconnected local transport, preserving pairing and PC execution. */
  reconnect(id: string): void;
  /** Explicitly disconnects the local transport without revoking pairing or grants. */
  disconnect(id: string): void;
  getConnectionLiveStatus(id: string): DesktopLiveStatus;
  subscribeConnectionLiveStatus(id: string, listener: () => void): () => void;
  getEndpoints(id: string, signal: AbortSignal): Promise<DirectEndpoint[]>;
  saveEndpoint(
    id: string,
    endpoint: DirectEndpoint,
    signal: AbortSignal,
  ): Promise<{ endpoint: DirectEndpoint; verifiedAt: number }>;
  pair(
    input: PairDesktopConnectionDto,
    signal: AbortSignal,
    onProgress?: (progress: DesktopPairingProgress) => void,
  ): Promise<DesktopConnection>;
  testEndpoint(id: string, endpoint: DirectEndpoint, signal: AbortSignal): Promise<void>;
  remove(id: string, signal: AbortSignal): Promise<void>;
  preview(id: string, signal: AbortSignal): Promise<DesktopImportPreview>;
  import(
    id: string,
    input: DesktopImportSelectionsDto,
    signal: AbortSignal,
  ): Promise<DesktopImportResult>;
}
