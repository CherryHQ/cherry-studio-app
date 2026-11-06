import { File } from 'expo-file-system';

import type { DiagnosticFeedbackContext } from '@/shared/contracts/diagnostics';
import { flushLogWriter } from '@/shared/core/logger/LoggerService';

import { diagnosticDirectory, LOG_NAME } from './diagnosticFiles';
import { projectDiagnosticLog } from './diagnosticMetadata';

/** Bounded metadata tails only; arbitrary log strings never enter the AI context. */
export async function readDiagnosticLogSummary(
  context: DiagnosticFeedbackContext | undefined,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  flushLogWriter();
  const directory = diagnosticDirectory('logs');
  if (!directory.exists) return [];
  const files = directory
    .list()
    .filter((file): file is File => file instanceof File && LOG_NAME.test(file.name))
    .sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0))
    .slice(0, 2);
  const records: NonNullable<ReturnType<typeof projectDiagnosticLog>>[] = [];
  const since = Date.now() - 24 * 60 * 60 * 1000;
  for (const file of files) {
    signal.throwIfAborted();
    const handle = file.open();
    try {
      const size = handle.size ?? 0;
      const offset = Math.max(0, size - 32768);
      handle.offset = offset;
      const lines = new TextDecoder()
        .decode(handle.readBytesSync(Math.min(size, 32768)))
        .split('\n');
      if (offset) lines.shift();
      for (const line of lines.toReversed()) {
        try {
          const safe = projectDiagnosticLog(JSON.parse(line));
          if (!safe || Date.parse(safe.timestamp) < since || safe.level === 'info') continue;
          if (
            context?.providerId &&
            safe.facts.providerId &&
            safe.facts.providerId !== context.providerId
          )
            continue;
          records.push(safe);
          if (records.length === 12) return records;
        } catch {
          /* A partial or malformed line is not diagnostic evidence. */
        }
      }
    } finally {
      handle.close();
    }
  }
  return records;
}
