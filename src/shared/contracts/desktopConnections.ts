import type {
  DesktopImportPreview,
  DesktopImportResult,
  DesktopImportSelectionsDto,
  PairDesktopConnectionDto,
} from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

/** Sync enabled PC provider configuration; add missing enabled models and preserve existing models. */
export interface DesktopConnectionsModule {
  pair(input: PairDesktopConnectionDto, signal: AbortSignal): Promise<DesktopConnection>;
  remove(id: string, signal: AbortSignal): Promise<void>;
  preview(id: string, signal: AbortSignal): Promise<DesktopImportPreview>;
  import(
    id: string,
    input: DesktopImportSelectionsDto,
    signal: AbortSignal,
  ): Promise<DesktopImportResult>;
}
