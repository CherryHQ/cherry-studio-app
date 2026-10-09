import { File } from 'expo-file-system';

import type { LogRecord, LogWriter } from '@/shared/core/logger/LoggerService';

import { appendBytes, diagnosticDirectory } from './diagnosticFiles';
import { createDiagnosticLogAggregator } from './diagnosticLogAggregation';
import { projectDiagnosticLog } from './diagnosticMetadata';

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_HISTORY_BYTES = 20 * MAX_FILE_BYTES;
const MAX_AGE_MS = 7 * 86400000;
const LOG_NAME = /^app-error\.(\d{4}-\d{2}-\d{2})\.log(?:\.(\d+))?$/;

/** Only warning/error metadata is persisted, independently of database or host startup. */
export function createDiagnosticLogWriter(): LogWriter {
  const directory = diagnosticDirectory('logs');
  const encoder = new TextEncoder();
  let currentDay = '';
  let shard = 0;
  let historyBytes = 0;

  function prune(now: number) {
    historyBytes = 0;
    const files = directory
      .list()
      .filter((entry): entry is File => entry instanceof File && LOG_NAME.test(entry.name));
    files.sort((a, b) => (b.modificationTime ?? 0) - (a.modificationTime ?? 0));
    for (const file of files) {
      if (
        (file.modificationTime ?? 0) < now - MAX_AGE_MS ||
        historyBytes + file.size > MAX_HISTORY_BYTES
      )
        file.delete();
      else historyBytes += file.size;
    }
  }

  if (directory.exists) prune(Date.now());

  const aggregate = createDiagnosticLogAggregator((safe) => {
    const now = Date.now();
    if (Date.parse(safe.timestamp) < now - MAX_AGE_MS) return;
    const day = safe.timestamp.slice(0, 10);
    if (day !== currentDay) {
      directory.create({ intermediates: true, idempotent: true });
      prune(now);
      shard = 0;
      for (const entry of directory.list()) {
        const match = LOG_NAME.exec(entry.name);
        if (match?.[1] === day) shard = Math.max(shard, Number(match[2] ?? 0));
      }
      currentDay = day;
    }
    const bytes = encoder.encode(`${JSON.stringify(safe)}\n`);
    let file = new File(directory, `app-error.${day}.log${shard ? `.${shard}` : ''}`);
    if (file.exists && file.size + bytes.length > MAX_FILE_BYTES) {
      file = new File(directory, `app-error.${day}.log.${++shard}`);
    }
    appendBytes(file, bytes);
    historyBytes += bytes.length;
    if (historyBytes > MAX_HISTORY_BYTES) prune(now);
  });
  return Object.assign(
    (record: LogRecord) => {
      const safe = projectDiagnosticLog(record);
      if (safe) aggregate(safe);
    },
    { flush: aggregate.flush },
  );
}
