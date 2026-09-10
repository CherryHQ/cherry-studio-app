import { randomUUID } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';

import { AppStatePolicy, BaseService, DependsOn, Injectable } from '@/backend/core/lifecycle';
import type { DbService } from '@/backend/data/db/DbService';
import { createDiagnosticChatReader } from '@/backend/data/services/diagnosticChatRecords';
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
import { loggerService } from '@/shared/core/logger/LoggerService';

import { getNativeDiagnostics } from '../../../../modules/diagnostics';
import {
  collectChatRecords,
  scanChatRecordStats,
  stageChatRecords,
  type ChatRecordCandidate,
  type ChatRecordCollection,
} from './chatRecordCollector';
import { CherryDiagnosticUploadClient } from './CherryDiagnosticUploadClient';
import { createDiagnosticTemporaryDirectory } from './diagnosticFiles';
import {
  buildScanReport,
  diagnose,
  SCAN_REPORT_ARCHIVE_NAME,
  serializeScanReport,
} from './scan/engine';
import { collectErrorLogRecords } from './scan/logFileSource';
import {
  collectCrashDumpInventory,
  collectDiagnosticSources,
  SourceChangedError,
  sourceStats,
  stageSourceCandidate,
} from './sourceCollector';
import { selectBundleSources } from './sourceSelection';
import { collectDiagnosticSystemInfo } from './systemInfo';
import type {
  ChatRecordStats,
  DiagnosticTimeRange,
  DiagnosticWarning,
  SourceCandidate,
  SourceCollection,
  SourceStats,
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
function serializeTimeRange(range: DiagnosticTimeRange) {
  return { from: new Date(range.fromMs).toISOString(), to: new Date(range.toMs).toISOString() };
}
function mergeWarnings(target: Set<DiagnosticWarning>, source: ReadonlySet<DiagnosticWarning>) {
  for (const warning of source) target.add(warning);
}
function warningsArray(warnings: Set<DiagnosticWarning>) {
  return [...warnings].sort();
}
function stagedStats(sources: readonly StagedSource[], kind: 'logs' | 'traces'): SourceStats {
  return sources
    .filter((source) => source.kind === kind)
    .reduce(
      (stats, source) => ({
        bytes: stats.bytes + source.bytes,
        fileCount: stats.fileCount + 1,
        malformedLineCount: stats.malformedLineCount + source.malformedLineCount,
      }),
      { bytes: 0, fileCount: 0, malformedLineCount: 0 },
    );
}
function candidateStats(candidates: readonly SourceCandidate[], kind: 'logs' | 'traces') {
  return sourceStats(candidates.filter((candidate) => candidate.kind === kind));
}
function subtractChatStats(all: ChatRecordStats, included: ChatRecordStats): ChatRecordStats {
  return {
    bytes: all.bytes - included.bytes,
    messageCount: all.messageCount - included.messageCount,
    recordCount: all.recordCount - included.recordCount,
  };
}
function emptyChatRecordCollection(): ChatRecordCollection {
  return { candidates: (async function* () {})(), warnings: new Set() };
}
function cleanup(directory: Directory): void {
  try {
    if (directory.exists) directory.delete();
  } catch (error) {
    logger.warn('Failed to clean diagnostic temporary files', { error });
  }
}

@Injectable('DiagnosticBundleService')
@DependsOn(['DbService'])
@AppStatePolicy('continue')
export class DiagnosticBundleService extends BaseService implements DiagnosticsModule {
  private inFlightOperation: Promise<unknown> | null = null;
  private inspectionTail: Promise<unknown> = Promise.resolve();
  private readonly retainedUploads = new Map<string, RetainedUpload>();
  private readonly chats;
  private readonly uploader = new CherryDiagnosticUploadClient();
  private disposed = false;
  private readonly abort = new AbortController();

  constructor(database: DbService) {
    super();
    this.chats = createDiagnosticChatReader(database);
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
      try {
        const collection = await collectDiagnosticSources(
          range,
          { includeLogs: true, includeTraces: true },
          this.abort.signal,
        );
        const chatCollection = collectChatRecords(this.chats, range, this.abort.signal);
        const chats = await scanChatRecordStats(chatCollection.candidates);
        mergeWarnings(collection.warnings, chatCollection.warnings);
        const crashDumps = await collectCrashDumpInventory(range, collection.warnings);
        return {
          hasWarnings: collection.warnings.size > 0,
          sourceLimitBytes: DIAGNOSTIC_SOURCE_LIMIT_BYTES,
          sources: {
            chatRecords: {
              available: chats.messageCount > 0,
              estimatedBytes: chats.bytes,
              messageCount: chats.messageCount,
            },
            crashDumps: { fileCount: crashDumps.files.length },
            logs: {
              available: collection.logs.length > 0,
              estimatedBytes: sourceStats(collection.logs).bytes,
              fileCount: collection.logs.length,
            },
            traces: {
              available: collection.traces.length > 0,
              estimatedBytes: sourceStats(collection.traces).bytes,
              fileCount: collection.traces.length,
            },
          },
        };
      } catch (cause) {
        throw new DiagnosticError('INSPECT_FAILED', { cause });
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

  private async prepare(input: DiagnosticBundleInput, uploadedAutomatically: boolean) {
    const bundleId = randomUUID();
    let tempRoot: Directory | undefined;
    try {
      this.abort.signal.throwIfAborted();
      tempRoot = createDiagnosticTemporaryDirectory(bundleId);
      const fileName = `cherry-studio-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}-${bundleId}.zip`;
      const destination = new File(tempRoot, fileName);
      const range = toTimeRange(input.range, Date.now());
      const collection = await collectDiagnosticSources(range, input, this.abort.signal);
      const chatCollection = input.includeChatRecords
        ? collectChatRecords(this.chats, range, this.abort.signal)
        : emptyChatRecordCollection();
      const selection = await selectBundleSources(
        [...collection.logs, ...collection.traces],
        chatCollection,
      );
      mergeWarnings(collection.warnings, chatCollection.warnings);
      if (selection.omittedFiles.length || selection.omittedChats)
        collection.warnings.add('size_limit_reached');
      const bundle = await this.buildBundle({
        ...selection,
        sizeOmittedFiles: selection.omittedFiles,
        bundleId,
        collection,
        destination,
        input,
        range,
        tempRoot,
        uploadedAutomatically,
      });
      // Only the ZIP is needed for upload/retry. Source staging files may be large.
      for (const entry of tempRoot.list()) if (entry.uri !== destination.uri) entry.delete();
      return { bundle, tempRoot };
    } catch (cause) {
      if (tempRoot) cleanup(tempRoot);
      throw new DiagnosticError('BUNDLE_BUILD_FAILED', { cause });
    }
  }

  private async buildBundle({
    allChatStats,
    bundleId,
    collection,
    destination,
    expectedChatArchiveNames,
    input,
    range,
    selectedChats,
    selectedFiles,
    sizeOmittedFiles,
    tempRoot,
    uploadedAutomatically,
  }: {
    allChatStats: ChatRecordStats;
    bundleId: string;
    collection: SourceCollection;
    destination: File;
    expectedChatArchiveNames: ReadonlySet<string>;
    input: DiagnosticBundleInput;
    range: DiagnosticTimeRange;
    selectedChats: ChatRecordCandidate[];
    selectedFiles: SourceCandidate[];
    sizeOmittedFiles: SourceCandidate[];
    tempRoot: Directory;
    uploadedAutomatically: boolean;
  }): Promise<DiagnosticSavedBundle> {
    const staged: StagedSource[] = [];
    const failedCandidates: SourceCandidate[] = [];

    for (const [index, candidate] of selectedFiles.entries()) {
      const stagedPath = new File(tempRoot, `source-${index}.jsonl`);
      try {
        staged.push(await stageSourceCandidate(candidate, range, stagedPath, this.abort.signal));
      } catch (error) {
        this.abort.signal.throwIfAborted();
        failedCandidates.push(candidate);
        collection.warnings.add(
          error instanceof SourceChangedError ? 'source_changed' : 'source_unreadable',
        );
        logger.warn('Skipped a diagnostic source that could not be staged', {
          code: error instanceof Error ? error.name : 'UNKNOWN',
        });
      }
    }

    let includedChatStats: ChatRecordStats = { bytes: 0, messageCount: 0, recordCount: 0 };
    let adjustedAllChatStats = allChatStats;
    if (selectedChats.length > 0) {
      try {
        const stagedFileBytes = staged.reduce((bytes, source) => bytes + source.bytes, 0);
        const chatResult = await stageChatRecords(
          this.chats,
          selectedChats,
          tempRoot,
          Math.max(0, DIAGNOSTIC_SOURCE_LIMIT_BYTES - stagedFileBytes),
          this.abort.signal,
        );
        staged.push(...chatResult.sources);
        includedChatStats = chatResult.included;
        adjustedAllChatStats = {
          ...allChatStats,
          bytes: allChatStats.bytes + chatResult.observedByteDelta,
        };
        mergeWarnings(collection.warnings, chatResult.warnings);
      } catch (error) {
        this.abort.signal.throwIfAborted();
        collection.warnings.add('source_unreadable');
        logger.warn('Skipped diagnostic chat records that could not be staged', {
          code: error instanceof Error ? error.name : 'UNKNOWN',
        });
      }
    }

    // Mechanical error scan over the raw error logs. Gated on includeLogs so the
    // report cannot leak log contents the user opted out of; failure never blocks export.
    let scanReportJson: string | undefined;
    let scan:
      | { status: 'included'; findingCount: number; truncated: boolean; skippedFileCount: number }
      | { status: 'skipped' }
      | { status: 'failed' } = { status: 'skipped' };
    if (input.includeLogs) {
      try {
        const scanned = await collectErrorLogRecords(range, this.abort.signal);
        const findings = diagnose(scanned.records);
        scanReportJson = serializeScanReport(
          buildScanReport(findings, {
            range,
            scannedRecordCount: scanned.records.length,
            unparsedLineCount: scanned.unparsedLineCount,
            skippedFileCount: scanned.skippedFileCount,
            truncated: scanned.truncated,
          }),
        );
        // an incomplete scan must be visible in the manifest: triage should not have to open
        // scan/findings.json to learn that most of the logs were never read
        scan = {
          status: 'included',
          findingCount: findings.length,
          truncated: scanned.truncated,
          skippedFileCount: scanned.skippedFileCount,
        };
      } catch (error) {
        this.abort.signal.throwIfAborted();
        collection.warnings.add('scan_failed');
        scan = { status: 'failed' };
        logger.warn('Failed to build the diagnostic scan report', {
          code: error instanceof Error ? error.name : 'UNKNOWN',
        });
      }
    }

    const crashDumps = await collectCrashDumpInventory(range, collection.warnings);
    const system = await collectDiagnosticSystemInfo(collection.warnings);
    const included = {
      chatRecords: includedChatStats,
      logs: stagedStats(staged, 'logs'),
      traces: stagedStats(staged, 'traces'),
    };
    const omittedCandidates = [...sizeOmittedFiles, ...failedCandidates];
    const omitted = {
      chatRecords: subtractChatStats(adjustedAllChatStats, included.chatRecords),
      logs: candidateStats(omittedCandidates, 'logs'),
      traces: candidateStats(omittedCandidates, 'traces'),
    };
    const serializedRange = serializeTimeRange(range);
    const warnings = warningsArray(collection.warnings);
    const manifest = {
      schemaVersion: 2,
      bundleId,
      createdAt: new Date(range.toMs).toISOString(),
      range: serializedRange,
      privacy: {
        containsUnredactedData:
          input.includeChatRecords || input.includeLogs || input.includeTraces,
        publiclyShareable: false,
        uploadedAutomatically,
      },
      selection: {
        includeChatRecords: input.includeChatRecords,
        includeLogs: input.includeLogs,
        includeSystemInformation: true,
        includeTraces: input.includeTraces,
        persistedTracesOnly: true,
      },
      sourceLimitBytes: DIAGNOSTIC_SOURCE_LIMIT_BYTES,
      system,
      crashDumps: {
        files: crashDumps.files,
        mode: 'inventory_only',
        totalBytes: crashDumps.totalBytes,
      },
      scan,
      sources: {
        chatRecords: { included: included.chatRecords, omitted: omitted.chatRecords },
        logs: { included: included.logs, omitted: omitted.logs },
        traces: { included: included.traces, omitted: omitted.traces },
      },
      warnings,
    };

    const entries = [
      { name: 'diagnostics.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
      ...(scanReportJson !== undefined
        ? [{ name: SCAN_REPORT_ARCHIVE_NAME, content: scanReportJson }]
        : []),
    ];
    await writeBundleZip(destination, entries, staged, this.abort.signal);

    const archiveBytes = destination.size;
    const stagedChatArchiveNames = new Set(
      staged.filter((source) => source.kind === 'chatRecords').map((source) => source.archiveName),
    );
    const omittedChatArchiveCount = [...expectedChatArchiveNames].filter(
      (archiveName) => !stagedChatArchiveNames.has(archiveName),
    ).length;
    return {
      archiveBytes,
      bundleId,
      filePath: destination.uri,
      fileName: destination.name,
      hasWarnings: warnings.length > 0,
      includedFileCount: staged.length,
      omittedFileCount: omitted.logs.fileCount + omitted.traces.fileCount + omittedChatArchiveCount,
      status: 'saved',
    };
  }
}
