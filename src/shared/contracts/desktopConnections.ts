import type { DirectEndpoint } from '@cherrystudio/remote-protocol';

import type {
  DesktopImportPreview,
  DesktopPairingClaim,
  DesktopImportResult,
  DesktopImportSelectionsDto,
  PairDesktopConnectionDto,
} from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

export type DesktopPairingProgress =
  | { stage: 'connecting' | 'requesting' | 'saving' | 'syncing' }
  | { stage: 'waiting'; claim: DesktopPairingClaim };

/** Sync enabled PC provider configuration; add missing enabled models and preserve existing models. */
export interface DesktopConnectionsModule {
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
  remove(id: string, signal: AbortSignal): Promise<void>;
  preview(id: string, signal: AbortSignal): Promise<DesktopImportPreview>;
  import(
    id: string,
    input: DesktopImportSelectionsDto,
    signal: AbortSignal,
  ): Promise<DesktopImportResult>;
}
