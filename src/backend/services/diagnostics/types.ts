export type DiagnosticTimeRange = { readonly fromMs: number; readonly toMs: number };
export type DiagnosticFileSourceKind = 'logs' | 'traces';
export type DiagnosticWarning =
  | 'malformed_lines'
  | 'size_limit_reached'
  | 'source_changed'
  | 'source_unreadable'
  | 'system_info_unavailable'
  | 'trace_snapshot_failed'
  | 'trace_records_lost'
  | 'plugin_snapshot_failed'
  | 'plugin_snapshot_truncated';
export type SourceIdentity = {
  readonly size: number;
  readonly modifiedAt: number;
  readonly fileKey: string;
};
export type SourceCandidate = {
  readonly archiveName: string;
  readonly eligibleBytes: number;
  readonly identity: SourceIdentity;
  readonly kind: DiagnosticFileSourceKind;
  readonly latestAt: number;
  readonly malformedLineCount: number;
  readonly sourcePath: string;
};
export type SourceStats = { bytes: number; fileCount: number; malformedLineCount: number };
export type StagedSource = {
  readonly archiveName: string;
  readonly bytes: number;
  readonly kind: DiagnosticFileSourceKind;
  readonly malformedLineCount: number;
  readonly path: string;
};
export type SourceCollection = {
  logs: SourceCandidate[];
  traces: SourceCandidate[];
  warnings: Set<DiagnosticWarning>;
};
