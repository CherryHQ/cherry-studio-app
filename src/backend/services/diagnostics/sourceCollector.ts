import { File, FileMode } from 'expo-file-system';

import type { TraceDiagnosticSnapshot } from '@/backend/utils/diagnosticTrace';

import { getNativeDiagnostics } from '../../../../modules/diagnostics';
import { diagnosticDirectory, yieldToRuntime } from './diagnosticFiles';
import { projectDiagnosticLog, projectDiagnosticTrace } from './diagnosticMetadata';
import type {
  DiagnosticFileSourceKind,
  DiagnosticTimeRange,
  SourceCandidate,
  SourceCollection,
  StagedSource,
} from './types';

export const LOG_NAME = /^app-error\.(\d{4}-\d{2}-\d{2})\.log(?:\.\d+)?$/;
const MAX_JSON_LINE_BYTES = 128 * 1024;
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

/** Project on both inspection and staging; budget the bytes actually exported. */
export function projectDiagnosticLine(
  line: RawLine,
  kind: DiagnosticFileSourceKind,
  range: DiagnosticTimeRange,
) {
  if (line.tooLarge || !line.data) return 'malformed' as const;
  try {
    const value = JSON.parse(decoder.decode(line.data));
    const record =
      kind === 'logs'
        ? value?.schemaVersion === 1 && value.capture === 'metadata'
          ? projectDiagnosticLog(value)
          : undefined
        : projectDiagnosticTrace(value);
    if (!record) return 'malformed' as const;
    const timestamp =
      'timestamp' in record ? Date.parse(record.timestamp) : (record.endedAt ?? record.startedAt);
    if (timestamp < range.fromMs || timestamp > range.toMs) return undefined;
    return { timestamp, data: new TextEncoder().encode(`${JSON.stringify(record)}\n`) };
  } catch {
    return 'malformed' as const;
  }
}

export async function collectDiagnosticSources(
  range: DiagnosticTimeRange,
  selection: { includeLogs: boolean; includeTraces: boolean },
  signal?: AbortSignal,
  snapshot?: TraceDiagnosticSnapshot,
): Promise<SourceCollection> {
  const collection: SourceCollection = { logs: [], traces: [], warnings: new Set() };
  const sources: { file: File; name: string; kind: DiagnosticFileSourceKind }[] = [];
  if (selection.includeLogs) {
    try {
      const root = diagnosticDirectory('logs');
      if (root.exists) {
        for (const file of root.list()) {
          if (file instanceof File && LOG_NAME.test(file.name)) {
            sources.push({ file, name: `logs/${file.name}`, kind: 'logs' });
          }
        }
      }
    } catch {
      collection.warnings.add('source_unreadable');
    }
  }
  if (selection.includeTraces && snapshot) {
    for (const entry of snapshot.files) {
      if (/^\d+-[0-9a-f-]{36}\.jsonl$/.test(entry.name))
        sources.push({ file: new File(entry.uri), name: `traces/${entry.name}`, kind: 'traces' });
    }
  }
  for (const { file, name, kind } of sources) {
    signal?.throwIfAborted();
    try {
      const identity = getNativeDiagnostics().identifyFile(file.uri);
      let eligibleBytes = 0;
      let malformedLineCount = 0;
      let latestAt = 0;
      for await (const line of readRawLines(file, identity.size, signal)) {
        const projected = projectDiagnosticLine(line, kind, range);
        if (projected === 'malformed') {
          malformedLineCount += 1;
          continue;
        }
        if (!projected) continue;
        eligibleBytes += projected.data.length;
        latestAt = Math.max(latestAt, projected.timestamp);
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
  return collection;
}

export function sourceStats(candidates: readonly SourceCandidate[]) {
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
  if (!same && !(candidate.kind === 'logs' && source.size > candidate.identity.size))
    throw new SourceChangedError();
  destination.create({ intermediates: true });
  const writer = destination.open();
  let bytes = 0;
  let malformedLineCount = 0;
  try {
    for await (const line of readRawLines(source, candidate.identity.size, signal)) {
      const projected = projectDiagnosticLine(line, candidate.kind, range);
      if (projected === 'malformed') {
        malformedLineCount += 1;
        continue;
      }
      if (!projected) continue;
      if (bytes + projected.data.length > candidate.eligibleBytes) throw new SourceChangedError();
      writer.writeBytes(projected.data);
      bytes += projected.data.length;
    }
    const finalIdentity = getNativeDiagnostics().identifyFile(source.uri);
    if (
      finalIdentity.fileKey !== candidate.identity.fileKey ||
      bytes !== candidate.eligibleBytes ||
      malformedLineCount !== candidate.malformedLineCount ||
      !(
        (finalIdentity.size === identity.size &&
          finalIdentity.modifiedAt === identity.modifiedAt) ||
        (candidate.kind === 'logs' && finalIdentity.size > identity.size)
      )
    )
      throw new SourceChangedError();
    return {
      archiveName: candidate.archiveName,
      bytes,
      kind: candidate.kind,
      malformedLineCount,
      path: destination.uri,
    };
  } finally {
    writer.close();
  }
}
