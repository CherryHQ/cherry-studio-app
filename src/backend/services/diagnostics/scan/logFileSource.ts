import { File } from 'expo-file-system';

import { diagnosticDirectory } from '../diagnosticFiles';
import { LOG_NAME, logMayOverlapRange, readRawLines } from '../sourceCollector';
import type { DiagnosticTimeRange } from '../types';
import { MAX_SCAN_RECORDS, parseErrorLogLine } from './parseErrorLogLine';
import type { ErrorLogScan, LogRecord } from './types';

function shardKey(name: string): readonly [string, number] {
  const match = /^(.*\.log)\.(\d+)$/.exec(name);
  return match ? [match[1], Number(match[2])] : [name, 0];
}

export async function collectErrorLogRecords(
  range: DiagnosticTimeRange,
  signal?: AbortSignal,
): Promise<ErrorLogScan> {
  const ring: LogRecord[] = [];
  let oldest = 0;
  let unparsedLineCount = 0;
  let skippedFileCount = 0;
  let truncated = false;
  const directory = diagnosticDirectory('logs');
  const files = directory.exists
    ? directory
        .list()
        .filter(
          (entry): entry is File =>
            entry instanceof File &&
            entry.name.startsWith('app-error.') &&
            LOG_NAME.test(entry.name) &&
            logMayOverlapRange(entry.name, range),
        )
    : [];
  files.sort((a, b) => {
    const [baseA, shardA] = shardKey(a.name);
    const [baseB, shardB] = shardKey(b.name);
    return baseA === baseB ? shardA - shardB : baseA < baseB ? -1 : 1;
  });
  for (const file of files) {
    signal?.throwIfAborted();
    try {
      let lineNumber = 0;
      for await (const line of readRawLines(file, file.size, signal)) {
        lineNumber += 1;
        if (line.tooLarge || !line.data) {
          unparsedLineCount += 1;
          continue;
        }
        const text = new TextDecoder().decode(line.data);
        if (!text.trim()) continue;
        const record = parseErrorLogLine(text);
        if (!record) {
          unparsedLineCount += 1;
          continue;
        }
        if (record.timestampMs < range.fromMs || record.timestampMs > range.toMs) continue;
        const sourced = { ...record, source: { file: file.name, line: lineNumber } };
        if (ring.length < MAX_SCAN_RECORDS) ring.push(sourced);
        else {
          ring[oldest] = sourced;
          oldest = (oldest + 1) % MAX_SCAN_RECORDS;
          truncated = true;
        }
      }
    } catch {
      signal?.throwIfAborted();
      skippedFileCount += 1;
    }
  }
  return {
    records: truncated ? [...ring.slice(oldest), ...ring.slice(0, oldest)] : ring,
    unparsedLineCount,
    skippedFileCount,
    truncated,
  };
}
