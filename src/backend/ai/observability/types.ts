import type { TraceContext, TraceSpanStatus } from '@/shared/data/types/trace';

export type TraceAttributes = Record<string, string | number | boolean | undefined>;
export type TraceEndStatus = Exclude<TraceSpanStatus, 'running'>;

/** Explicit parents keep concurrent mobile turns isolated without a global async context. */
export interface TraceSpan {
  readonly traceId: string;
  readonly spanId: string;
  startSpan(name: string, attributes?: TraceAttributes): TraceSpan | undefined;
  setAttributes(attributes: TraceAttributes): void;
  end(status: TraceEndStatus, attributes?: TraceAttributes): void;
}

/** All producer methods are best effort and must never throw into the operation being traced. */
export interface TraceRecorder {
  startTrace(
    name: string,
    context?: TraceContext,
    attributes?: TraceAttributes,
  ): TraceSpan | undefined;
  flush(): Promise<void>;
}

export type TraceDiagnosticSnapshot = {
  directoryUri: string;
  files: { name: string; uri: string; size: number }[];
  /** The diagnostic-package owner releases its private snapshot after consuming it. */
  dispose(): void;
};

export type TraceFileStorage = {
  writeBatch(lines: readonly string[], now: number): Promise<void>;
  prune(now: number): Promise<void>;
  snapshot(now: number, diagnostics: TraceStorageDiagnostics): Promise<TraceDiagnosticSnapshot>;
};

export type TraceStorageDiagnostics = {
  droppedRecords: number;
  writeFailures: number;
};
