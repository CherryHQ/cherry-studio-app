import { randomUUID } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { DbService } from '@/backend/data/db/DbService';
import { readDiagnosticPluginState } from '@/backend/data/services/diagnosticPluginState';
import { diagnosticIdentifier } from '@/backend/utils/diagnosticIdentifier';
import type { TraceDiagnosticSnapshot } from '@/backend/utils/diagnosticTrace';
import {
  DiagnosticError,
  DiagnosticReportInputSchema,
  DIAGNOSTIC_SOURCE_LIMIT_BYTES,
  normalizeDiagnosticDescription,
  type DiagnosticsModule,
  type DiagnosticReportInput,
  type DiagnosticUploadResult,
} from '@/shared/contracts/diagnostics';
import { flushLogWriter, loggerService } from '@/shared/core/logger/LoggerService';

import { getNativeDiagnostics } from '../../../../modules/diagnostics';
import { CherryDiagnosticUploadClient } from './CherryDiagnosticUploadClient';
import { createDiagnosticTemporaryDirectory } from './diagnosticFiles';
import { getDiagnosticReportStatus } from './diagnosticReportStatus';
import {
  collectDiagnosticSources,
  SourceChangedError,
  sourceStats,
  stageSourceCandidate,
} from './sourceCollector';
import { selectBundleSources } from './sourceSelection';
import { collectDiagnosticSystemInfo } from './systemInfo';
import type { DiagnosticTimeRange, DiagnosticWarning, StagedSource } from './types';
import { writeBundleZip } from './writeBundleZip';

const logger = loggerService.withContext('DiagnosticBundleService');
// Feedback always submits the last 24 hours of logs and traces; there is no range selector.
const RANGE_DURATION_MS = 86400000;
function disposeSnapshot(snapshot: TraceDiagnosticSnapshot | undefined) {
  try {
    snapshot?.dispose();
  } catch {
    logger.warn('Failed to clean diagnostic snapshot');
  }
}
function cleanup(directory: Directory): void {
  try {
    if (directory.exists) directory.delete();
  } catch {
    logger.warn('Failed to clean diagnostic temporary files');
  }
}

@Injectable('DiagnosticBundleService')
@DependsOn(['DbService', 'TraceStorageService'])
@ServicePhase(Phase.PostReady)
@AppStatePolicy('continue')
export class DiagnosticBundleService extends BaseService implements DiagnosticsModule {
  private inFlightOperation: Promise<unknown> | null = null;
  private readonly uploader = new CherryDiagnosticUploadClient();
  private disposed = false;
  private readonly abort = new AbortController();

  getReportStatus(reportId: string, signal?: AbortSignal) {
    this.abort.signal.throwIfAborted();
    return getDiagnosticReportStatus(reportId, signal ?? this.abort.signal);
  }

  constructor(
    private readonly database: DbService,
    private readonly traces: { createDiagnosticSnapshot(): Promise<TraceDiagnosticSnapshot> },
  ) {
    super();
  }

  protected async onStop(): Promise<void> {
    this.disposed = true;
    this.abort.abort();
    try {
      getNativeDiagnostics().cancelOperations();
    } catch {
      /* Native module may be absent in an old dev client. */
    }
    await this.inFlightOperation?.catch(() => undefined);
  }

  private async exclusive<T>(action: () => Promise<T>): Promise<T | { status: 'busy' }> {
    if (this.inFlightOperation || this.disposed) return { status: 'busy' };
    const operation = Promise.resolve().then(() => {
      this.abort.signal.throwIfAborted();
      return action();
    });
    this.inFlightOperation = operation;
    try {
      return await operation;
    } finally {
      if (this.inFlightOperation === operation) this.inFlightOperation = null;
    }
  }

  uploadBundle(input: DiagnosticReportInput): Promise<DiagnosticUploadResult> {
    return this.exclusive(async (): Promise<DiagnosticUploadResult> => {
      const parsed = DiagnosticReportInputSchema.parse(input);
      // Missing native transport or signing credentials must not trigger collection.
      if (!this.uploader.isAvailable)
        return { status: 'submission_failed', reason: 'not_configured' };
      const { bundle, tempRoot } = await this.prepare(parsed);
      try {
        this.abort.signal.throwIfAborted();
        const result = await this.uploader.upload({
          description: normalizeDiagnosticDescription(parsed.description),
          fileName: bundle.fileName,
          filePath: bundle.filePath,
          signal: this.abort.signal,
        });
        if (result.status === 'uploaded') return result;
        if (result.status === 'submission_unknown') return { status: 'submission_unknown' };
        return { status: 'submission_failed', reason: result.reason };
      } finally {
        // Each attempt owns its ZIP, including failed, uncertain, and aborted uploads.
        // The UI keeps only the feedback text; a later submission creates a fresh archive.
        cleanup(tempRoot);
      }
    });
  }

  private async collect(range: DiagnosticTimeRange) {
    flushLogWriter();
    let snapshot: TraceDiagnosticSnapshot | undefined;
    const warnings = new Set<DiagnosticWarning>();
    try {
      snapshot = await this.traces.createDiagnosticSnapshot();
    } catch {
      warnings.add('trace_snapshot_failed');
    }
    try {
      const collection = await collectDiagnosticSources(range, this.abort.signal, snapshot);
      for (const warning of warnings) collection.warnings.add(warning);
      if (
        snapshot &&
        (snapshot.metadata.diagnostics.droppedRecords ||
          snapshot.metadata.diagnostics.writeFailures)
      )
        collection.warnings.add('trace_records_lost');
      return { collection, snapshot };
    } catch (error) {
      disposeSnapshot(snapshot);
      throw error;
    }
  }

  private async prepare(input: DiagnosticReportInput) {
    const bundleId = randomUUID();
    let tempRoot: Directory | undefined;
    let snapshot: TraceDiagnosticSnapshot | undefined;
    try {
      this.abort.signal.throwIfAborted();
      tempRoot = createDiagnosticTemporaryDirectory(bundleId);
      const fileName = `cherry-studio-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}-${bundleId}.zip`;
      const destination = new File(tempRoot, fileName);
      const now = Date.now();
      const range: DiagnosticTimeRange = { fromMs: now - RANGE_DURATION_MS, toMs: now };
      const collected = await this.collect(range);
      snapshot = collected.snapshot;
      const { collection } = collected;
      const { selectedFiles, omittedFiles } = selectBundleSources([
        ...collection.logs,
        ...collection.traces,
      ]);
      if (omittedFiles.length) collection.warnings.add('size_limit_reached');
      const staged: StagedSource[] = [];
      const omitted = [...omittedFiles];
      for (const [index, candidate] of selectedFiles.entries()) {
        try {
          staged.push(
            await stageSourceCandidate(
              candidate,
              range,
              new File(tempRoot, `source-${index}.jsonl`),
              this.abort.signal,
            ),
          );
        } catch (error) {
          this.abort.signal.throwIfAborted();
          omitted.push(candidate);
          collection.warnings.add(
            error instanceof SourceChangedError ? 'source_changed' : 'source_unreadable',
          );
        }
      }
      let plugins;
      try {
        const state = await readDiagnosticPluginState(this.database);
        if (state.truncated) collection.warnings.add('plugin_snapshot_truncated');
        plugins = {
          capturedAt: new Date().toISOString(),
          truncated: state.truncated,
          connections: state.connections.map((connection) => ({
            serverId: diagnosticIdentifier(connection.serverId),
            origin: connection.origin,
            pluginId: diagnosticIdentifier(connection.pluginId),
            enabled: connection.enabled,
            authMethod: diagnosticIdentifier(connection.authMethod),
            disabledToolCount: connection.disabledToolCount,
          })),
        };
      } catch {
        collection.warnings.add('plugin_snapshot_failed');
      }
      const system = collectDiagnosticSystemInfo(collection.warnings);
      const sourceSummary = (kind: 'logs' | 'traces') => ({
        included: staged
          .filter((source) => source.kind === kind)
          .reduce(
            (stats, source) => ({
              bytes: stats.bytes + source.bytes,
              fileCount: stats.fileCount + 1,
              malformedLineCount: stats.malformedLineCount + source.malformedLineCount,
            }),
            { bytes: 0, fileCount: 0, malformedLineCount: 0 },
          ),
        omitted: sourceStats(omitted.filter((source) => source.kind === kind)),
      });
      const manifest = {
        schemaVersion: 2,
        bundleId,
        createdAt: new Date(range.toMs).toISOString(),
        range: {
          from: new Date(range.fromMs).toISOString(),
          to: new Date(range.toMs).toISOString(),
        },
        privacy: {
          capture: 'metadata',
          containsUnredactedData: true,
          publiclyShareable: false,
          uploadedAutomatically: true,
        },
        selection: {
          includeChatRecords: false,
          includeLogs: true,
          includeSystemInformation: true,
          includeTraces: true,
          persistedTracesOnly: true,
        },
        sourceLimitBytes: DIAGNOSTIC_SOURCE_LIMIT_BYTES,
        feedback: { file: 'feedback.txt', source: 'user' },
        system,
        plugins,
        // Retain empty Desktop schema-v2 fields; no crash or conversation sources are read.
        crashDumps: { files: [], mode: 'inventory_only', totalBytes: 0 },
        scan: { status: 'skipped' },
        trace: snapshot ? { format: 'mobile-trace-v1', ...snapshot.metadata } : undefined,
        sources: {
          chatRecords: {
            included: { bytes: 0, messageCount: 0, recordCount: 0 },
            omitted: { bytes: 0, messageCount: 0, recordCount: 0 },
          },
          logs: sourceSummary('logs'),
          traces: sourceSummary('traces'),
        },
        warnings: [...collection.warnings].sort(),
      };
      await writeBundleZip(
        destination,
        [
          { name: 'diagnostics.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
          { name: 'feedback.txt', content: normalizeDiagnosticDescription(input.description) },
        ],
        staged,
        this.abort.signal,
      );
      for (const entry of tempRoot.list()) if (entry.uri !== destination.uri) entry.delete();
      return { bundle: { fileName, filePath: destination.uri }, tempRoot };
    } catch (cause) {
      if (tempRoot) cleanup(tempRoot);
      throw new DiagnosticError('BUNDLE_BUILD_FAILED', { cause });
    } finally {
      disposeSnapshot(snapshot);
    }
  }
}
