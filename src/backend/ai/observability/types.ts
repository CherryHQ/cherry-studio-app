import type {
  TraceDiagnosticSnapshot,
  TraceStorageDiagnostics,
} from '@/backend/utils/diagnosticTrace';

export type {
  TraceAttributes,
  TraceDiagnosticSnapshot,
  TraceEndStatus,
  TraceRecorder,
  TraceSpan,
  TraceStorageDiagnostics,
} from '@/backend/utils/diagnosticTrace';

export type TraceFileStorage = {
  writeBatch(lines: readonly string[], now: number): Promise<void>;
  prune(now: number): Promise<void>;
  snapshot(now: number, diagnostics: TraceStorageDiagnostics): Promise<TraceDiagnosticSnapshot>;
};
