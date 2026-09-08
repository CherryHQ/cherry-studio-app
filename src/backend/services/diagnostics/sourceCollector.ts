import { Directory, File, FileMode } from 'expo-file-system';

import { getNativeDiagnostics } from '../../../../modules/diagnostics';
import { diagnosticDirectory, yieldToRuntime } from './diagnosticFiles';
import type {
  CrashDumpInventory,
  DiagnosticFileSourceKind,
  DiagnosticTimeRange,
  DiagnosticWarning,
  SourceCandidate,
  SourceCollection,
  SourceStats,
  StagedSource,
} from './types';

export const LOG_NAME = /^app(?:-error)?\.(\d{4}-\d{2}-\d{2})\.log(?:\.\d+)?$/;
const MAX_JSON_LINE_BYTES = 16 * 1024 * 1024;
const decoder = new TextDecoder();
export type RawLine = { data?: Uint8Array; tooLarge: boolean };

export class SourceChangedError extends Error {
  constructor() {
    super('Diagnostic source changed while it was being exported');
  }
}

/** Bounded, byte-preserving reader, including the final unterminated line. */
export async function* readRawLines(
  file: File,
  size = file.size,
  signal?: AbortSignal,
): AsyncGenerator<RawLine> {
  const handle = file.open(FileMode.ReadOnly);
  let parts: Uint8Array[] = [];
  let lineBytes = 0;
  let tooLarge = false;
  let remaining = size;
  try {
    while (remaining > 0) {
      signal?.throwIfAborted();
      const chunk = handle.readBytes(Math.min(64 * 1024, remaining));
      if (chunk.length === 0) throw new SourceChangedError();
      remaining -= chunk.length;
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(0x0a, offset);
        const end = newline === -1 ? chunk.length : newline + 1;
        if (!tooLarge) {
          if (lineBytes + end - offset > MAX_JSON_LINE_BYTES) {
            tooLarge = true;
            parts = [];
            lineBytes = 0;
          } else {
            parts.push(chunk.subarray(offset, end));
            lineBytes += end - offset;
          }
        }
        if (newline !== -1) {
          yield tooLarge
            ? { tooLarge: true }
            : { data: concatenate(parts, lineBytes), tooLarge: false };
          parts = [];
          lineBytes = 0;
          tooLarge = false;
        }
        offset = end;
      }
      await yieldToRuntime();
    }
    if (lineBytes || tooLarge)
      yield tooLarge
        ? { tooLarge: true }
        : { data: concatenate(parts, lineBytes), tooLarge: false };
  } finally {
    handle.close();
  }
}

function concatenate(parts: Uint8Array[], size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

export function parseLogTimestampString(value: string): number | undefined {
  const timestamp = Date.parse(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function logMayOverlapRange(name: string, range: DiagnosticTimeRange): boolean {
  const match = LOG_NAME.exec(name);
  if (!match) return false;
  const [year, month, day] = match[1].split('-').map(Number);
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day)
    return false;
  return (
    start.getTime() <= range.toMs && new Date(year, month - 1, day + 1).getTime() > range.fromMs
  );
}

function classifyLine(
  line: RawLine,
  kind: DiagnosticFileSourceKind,
  range: DiagnosticTimeRange,
): number | 'malformed' | undefined {
  if (line.tooLarge || !line.data) return 'malformed';
  const text = decoder.decode(line.data).trim();
  if (!text) return undefined;
  try {
    const value = JSON.parse(text);
    const timestamp =
      kind === 'traces'
        ? value?.startTime
        : typeof value?.timestamp === 'string'
          ? parseLogTimestampString(value.timestamp)
          : undefined;
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return 'malformed';
    return timestamp >= range.fromMs && timestamp <= range.toMs ? timestamp : undefined;
  } catch {
    return 'malformed';
  }
}

function portableSegment(value: string): string {
  return [...new TextEncoder().encode(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function collectDiagnosticSources(
  range: DiagnosticTimeRange,
  selection: { includeLogs: boolean; includeTraces: boolean },
  signal?: AbortSignal,
): Promise<SourceCollection> {
  const collection: SourceCollection = { logs: [], traces: [], warnings: new Set() };
  for (const kind of ['logs', 'traces'] as const) {
    if (!(kind === 'logs' ? selection.includeLogs : selection.includeTraces)) continue;
    const root = diagnosticDirectory(kind);
    if (!root.exists) continue;
    try {
      const sources: { file: File; name: string }[] = [];
      for (const entry of root.list()) {
        if (kind === 'logs' && entry instanceof File && logMayOverlapRange(entry.name, range)) {
          sources.push({ file: entry, name: `logs/${entry.name}` });
        } else if (kind === 'traces' && entry instanceof Directory) {
          try {
            for (const trace of entry.list()) {
              if (
                trace instanceof File &&
                !trace.name.endsWith('.tmp') &&
                (trace.modificationTime ?? 0) >= range.fromMs
              ) {
                sources.push({
                  file: trace,
                  name: `traces/${portableSegment(entry.name)}/${portableSegment(trace.name)}.jsonl`,
                });
              }
            }
          } catch {
            signal?.throwIfAborted();
            collection.warnings.add('source_unreadable');
          }
        }
      }
      for (const { file, name } of sources) {
        signal?.throwIfAborted();
        try {
          const identity = getNativeDiagnostics().identifyFile(file.uri);
          let eligibleBytes = 0;
          let malformedLineCount = 0;
          let latestAt = 0;
          for await (const line of readRawLines(file, identity.size, signal)) {
            const timestamp = classifyLine(line, kind, range);
            if (timestamp === 'malformed') {
              malformedLineCount += 1;
              continue;
            }
            if (timestamp === undefined) continue;
            eligibleBytes += line.data!.length;
            latestAt = Math.max(latestAt, timestamp);
          }
          if (getNativeDiagnostics().identifyFile(file.uri).fileKey !== identity.fileKey)
            throw new SourceChangedError();
          if (malformedLineCount) collection.warnings.add('malformed_lines');
          if (eligibleBytes)
            collection[kind].push({
              archiveName: name,
              eligibleBytes,
              identity,
              kind,
              latestAt,
              malformedLineCount,
              sourcePath: file.uri,
            });
        } catch (error) {
          signal?.throwIfAborted();
          collection.warnings.add(
            error instanceof SourceChangedError ? 'source_changed' : 'source_unreadable',
          );
        }
      }
    } catch {
      signal?.throwIfAborted();
      collection.warnings.add('source_unreadable');
    }
  }
  return collection;
}

export function sourceStats(candidates: readonly SourceCandidate[]): SourceStats {
  return candidates.reduce(
    (stats, candidate) => ({
      bytes: stats.bytes + candidate.eligibleBytes,
      fileCount: stats.fileCount + 1,
      malformedLineCount: stats.malformedLineCount + candidate.malformedLineCount,
    }),
    { bytes: 0, fileCount: 0, malformedLineCount: 0 },
  );
}

export async function stageSourceCandidate(
  candidate: SourceCandidate,
  range: DiagnosticTimeRange,
  destination: File,
  signal?: AbortSignal,
): Promise<StagedSource> {
  const source = new File(candidate.sourcePath);
  const identity = getNativeDiagnostics().identifyFile(source.uri);
  if (identity.fileKey !== candidate.identity.fileKey) throw new SourceChangedError();
  const same =
    identity.size === candidate.identity.size &&
    identity.modifiedAt === candidate.identity.modifiedAt;
  // Log files are append-only. Read exactly the inspected prefix, never lines
  // generated by the export itself; traces require an unchanged source.
  if (!same && !(candidate.kind === 'logs' && source.size > candidate.identity.size))
    throw new SourceChangedError();
  destination.create({ intermediates: true });
  const writer = destination.open();
  let bytes = 0;
  let malformedLineCount = 0;
  try {
    for await (const line of readRawLines(source, candidate.identity.size, signal)) {
      const timestamp = classifyLine(line, candidate.kind, range);
      if (timestamp === 'malformed') {
        malformedLineCount += 1;
        continue;
      }
      if (timestamp === undefined) continue;
      writer.writeBytes(line.data!);
      bytes += line.data!.length;
    }
    if (bytes !== candidate.eligibleBytes || malformedLineCount !== candidate.malformedLineCount)
      throw new SourceChangedError();
    if (getNativeDiagnostics().identifyFile(source.uri).fileKey !== identity.fileKey)
      throw new SourceChangedError();
    return {
      archiveName: candidate.archiveName,
      bytes,
      kind: candidate.kind,
      malformedLineCount,
      path: destination.uri,
    };
  } catch (error) {
    writer.close();
    if (destination.exists) destination.delete();
    throw error;
  } finally {
    try {
      writer.close();
    } catch {
      /* Already closed on failure. */
    }
  }
}

export async function collectCrashDumpInventory(
  range: DiagnosticTimeRange,
  warnings: Set<DiagnosticWarning>,
): Promise<CrashDumpInventory> {
  const files: CrashDumpInventory['files'] = [];
  const root = diagnosticDirectory('crashes');
  if (root.exists) {
    try {
      for (const file of root.list()) {
        if (!(file instanceof File)) continue;
        const timestamp = file.modificationTime;
        if (timestamp !== null && timestamp >= range.fromMs && timestamp <= range.toMs)
          files.push({ createdAt: new Date(timestamp).toISOString(), size: file.size });
      }
    } catch {
      warnings.add('source_unreadable');
    }
  }
  files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { files, totalBytes: files.reduce((total, file) => total + file.size, 0) };
}
