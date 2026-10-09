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
  DiagnosticBundleInputSchema,
  DiagnosticError,
  DiagnosticRangeSchema,
  DiagnosticUploadInputSchema,
  DIAGNOSTIC_SOURCE_LIMIT_BYTES,
  normalizeDiagnosticDescription,
  type DiagnosticBundleInput,
  type DiagnosticExportResult,
  type DiagnosticInspection,
  type DiagnosticRange,
  type DiagnosticSavedBundle,
  type DiagnosticSaveUploadResult,
  type DiagnosticsModule,
  type DiagnosticUploadInput,
  type DiagnosticUploadResult,
} from '@/shared/contracts/diagnostics';
import { flushLogWriter, loggerService } from '@/shared/core/logger/LoggerService';

import { getNativeDiagnostics } from '../../../../modules/diagnostics';
import { CherryDiagnosticUploadClient } from './CherryDiagnosticUploadClient';
import { createDiagnosticTemporaryDirectory } from './diagnosticFiles';
import {
  collectDiagnosticSources,
  SourceChangedError,
  sourceStats,
  stageSourceCandidate,
} from './sourceCollector';
import { selectBundleSources } from './sourceSelection';
import { collectDiagnosticSystemInfo } from './systemInfo';
import type {
  DiagnosticTimeRange,
  DiagnosticWarning,
  SourceCandidate,
  StagedSource,
} from './types';
import { writeBundleZip } from './writeBundleZip';

const logger = loggerService.withContext('DiagnosticBundleService');
const RANGE_DURATION_MS = { '24h': 86400000, '3d': 3 * 86400000, '7d': 7 * 86400000 };
type RetainedUpload = {
  bundle: DiagnosticSavedBundle;
  tempRoot: Directory;
  description: string;
  fileSha256?: string;
  savedUri?: string;
};
function toTimeRange(range: DiagnosticRange, now: number): DiagnosticTimeRange {
  return { fromMs: now - RANGE_DURATION_MS[range], toMs: now };
}
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
  private inspectionTail: Promise<unknown> = Promise.resolve();
  private readonly retainedUploads = new Map<string, RetainedUpload>();
  private readonly uploader = new CherryDiagnosticUploadClient();
  private disposed = false;
  private readonly abort = new AbortController();

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
    await Promise.allSettled([this.inspectionTail, this.inFlightOperation]);
    for (const retained of this.retainedUploads.values()) cleanup(retained.tempRoot);
    this.retainedUploads.clear();
  }

  inspect(rangeName: DiagnosticRange): Promise<DiagnosticInspection> {
    const operation = this.inspectionTail.then(async () => {
      if (this.disposed) throw new DiagnosticError('INSPECT_FAILED');
      const range = toTimeRange(DiagnosticRangeSchema.parse(rangeName), Date.now());
      let snapshot: TraceDiagnosticSnapshot | undefined;
      try {
        const collected = await this.collect(range, { includeLogs: true, includeTraces: true });
        snapshot = collected.snapshot;
        const { collection } = collected;
        const info = (sources: SourceCandidate[]) => ({
          available: sources.length > 0,
          estimatedBytes: sourceStats(sources).bytes,
          fileCount: sources.length,
        });
        return {
          hasWarnings: collection.warnings.size > 0,
          sourceLimitBytes: DIAGNOSTIC_SOURCE_LIMIT_BYTES,
          sources: { logs: info(collection.logs), traces: info(collection.traces) },
        };
      } catch (cause) {
        throw new DiagnosticError('INSPECT_FAILED', { cause });
      } finally {
        disposeSnapshot(snapshot);
      }
    });
    this.inspectionTail = operation.catch(() => undefined);
    return operation;
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

  exportBundle(input: DiagnosticBundleInput): Promise<DiagnosticExportResult> {
    return this.exclusive(async (): Promise<DiagnosticExportResult> => {
      const native = this.native();
      const { bundle, tempRoot } = await this.prepare(
        DiagnosticBundleInputSchema.parse(input),
        false,
      );
      try {
        this.abort.signal.throwIfAborted();
        const destination = await native.saveFile(bundle.filePath, bundle.fileName);
        return destination ? { ...bundle, filePath: destination } : { status: 'canceled' };
      } catch (cause) {
        throw new DiagnosticError('SAVE_FAILED', { cause });
      } finally {
        cleanup(tempRoot);
      }
    });
  }

  uploadBundle(input: DiagnosticUploadInput): Promise<DiagnosticUploadResult> {
    return this.exclusive(async () => {
      this.native();
      const parsed = DiagnosticUploadInputSchema.parse(input);
      const prepared = await this.prepare(parsed, true);
      const retained: RetainedUpload = {
        ...prepared,
        description: normalizeDiagnosticDescription(parsed.description),
      };
      this.retainedUploads.set(prepared.bundle.bundleId, retained);
      return this.submit(retained);
    });
  }

  retryUpload({ bundleId }: { bundleId: string }): Promise<DiagnosticUploadResult> {
    return this.exclusive(() => this.submit(this.retained(bundleId)));
  }

  saveUploadBundle({ bundleId }: { bundleId: string }): Promise<DiagnosticSaveUploadResult> {
    return this.exclusive(async (): Promise<DiagnosticSaveUploadResult> => {
      const retained = this.retained(bundleId);
      try {
        const destination =
          retained.savedUri ??
          (await this.native().saveFile(retained.bundle.filePath, retained.bundle.fileName));
        if (!destination) return { status: 'canceled' };
        retained.savedUri = destination;
        // Files providers grant a destination URI, not permanent read authority.
        // Keep the original internal ZIP for retries until success/discard/stop.
        return {
          status: 'saved',
          bundleId,
          fileName: retained.bundle.fileName,
          filePath: destination,
        };
      } catch (cause) {
        throw new DiagnosticError('SAVE_FAILED', { cause });
      }
    });
  }

  discardUpload({
    bundleId,
  }: {
    bundleId: string;
  }): Promise<{ status: 'busy' | 'discarded' | 'not_found' }> {
    return this.exclusive(async () => {
      const retained = this.retainedUploads.get(bundleId);
      if (!retained) return { status: 'not_found' as const };
      this.retainedUploads.delete(bundleId);
      cleanup(retained.tempRoot);
      return { status: 'discarded' as const };
    });
  }

  private native() {
    try {
      return getNativeDiagnostics();
    } catch (cause) {
      throw new DiagnosticError('NATIVE_UNAVAILABLE', { cause });
    }
  }

  private retained(bundleId: string): RetainedUpload {
    const retained = this.retainedUploads.get(bundleId);
    if (!retained) throw new DiagnosticError('RETRY_NOT_AVAILABLE');
    return retained;
  }

  private async submit(retained: RetainedUpload): Promise<DiagnosticUploadResult> {
    this.abort.signal.throwIfAborted();
    const result = await this.uploader.upload({
      description: retained.description,
      expectedFileSha256: retained.fileSha256,
      fileName: retained.bundle.fileName,
      filePath: retained.bundle.filePath,
      signal: this.abort.signal,
    });
    if (result.status === 'uploaded') {
      this.retainedUploads.delete(retained.bundle.bundleId);
      cleanup(retained.tempRoot);
      return result;
    }
    if (result.fileSha256) retained.fileSha256 ??= result.fileSha256;
    const info = { bundleId: retained.bundle.bundleId, fileName: retained.bundle.fileName };
    if (result.status === 'submission_unknown') return { ...info, status: 'submission_unknown' };
    return { ...info, status: 'submission_failed', reason: result.reason };
  }

  private async collect(
    range: DiagnosticTimeRange,
    input: Pick<DiagnosticBundleInput, 'includeLogs' | 'includeTraces'>,
  ) {
    if (input.includeLogs) flushLogWriter();
    let snapshot: TraceDiagnosticSnapshot | undefined;
    const warnings = new Set<DiagnosticWarning>();
    if (input.includeTraces) {
      try {
        snapshot = await this.traces.createDiagnosticSnapshot();
      } catch {
        warnings.add('trace_snapshot_failed');
      }
    }
    try {
      const collection = await collectDiagnosticSources(range, input, this.abort.signal, snapshot);
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

  private async prepare(input: DiagnosticBundleInput, uploadedAutomatically: boolean) {
    const bundleId = randomUUID();
    let tempRoot: Directory | undefined;
    let snapshot: TraceDiagnosticSnapshot | undefined;
    try {
      this.abort.signal.throwIfAborted();
      tempRoot = createDiagnosticTemporaryDirectory(bundleId);
      const fileName = `cherry-studio-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}-${bundleId}.zip`;
      const destination = new File(tempRoot, fileName);
      const range = toTimeRange(input.range, Date.now());
      const collected = await this.collect(range, input);
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
          containsUnredactedData: false,
          publiclyShareable: false,
          uploadedAutomatically,
        },
        selection: {
          includeChatRecords: false,
          includeLogs: input.includeLogs,
          includeSystemInformation: true,
          includeTraces: input.includeTraces,
          persistedTracesOnly: true,
        },
        sourceLimitBytes: DIAGNOSTIC_SOURCE_LIMIT_BYTES,
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
        [{ name: 'diagnostics.json', content: `${JSON.stringify(manifest, null, 2)}\n` }],
        staged,
        this.abort.signal,
      );
      const bundle: DiagnosticSavedBundle = {
        status: 'saved',
        bundleId,
        fileName,
        filePath: destination.uri,
        archiveBytes: destination.size,
        includedFileCount: staged.length,
        omittedFileCount: omitted.length,
        hasWarnings: collection.warnings.size > 0,
      };
      for (const entry of tempRoot.list()) if (entry.uri !== destination.uri) entry.delete();
      return { bundle, tempRoot };
    } catch (cause) {
      if (tempRoot) cleanup(tempRoot);
      throw new DiagnosticError('BUNDLE_BUILD_FAILED', { cause });
    } finally {
      disposeSnapshot(snapshot);
    }
  }
}
