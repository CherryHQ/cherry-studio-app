import type {
  DesktopImportPreview,
  DesktopImportResult,
  DesktopImportSelectionsDto,
  PairDesktopConnectionDto,
} from '@/shared/data/api/schemas/desktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

/** One-way, incremental import. Existing provider configuration and models are never changed. */
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
