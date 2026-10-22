import { File } from 'expo-file-system';

import type { LogRecord, LogWriter } from '@/shared/core/logger/LoggerService';

import { appendBytes, diagnosticDirectory, LOG_NAME } from './diagnosticFiles';
import { createDiagnosticLogAggregator } from './diagnosticLogAggregation';
import { projectDiagnosticLog } from './diagnosticMetadata';

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_HISTORY_BYTES = 20 * MAX_FILE_BYTES;
const MAX_AGE_MS = 7 * 86400000;
const MAX_PENDING_BYTES = 64 * 1024;
const INFO_FLUSH_DELAY_MS = 100;

/** Warning/error and allowlisted lifecycle metadata, independent of database or host startup. */
export function createDiagnosticLogWriter(): LogWriter {
  const directory = diagnosticDirectory('logs');
  const encoder = new TextEncoder();
  let currentDay = '';
  let shard = 0;
  let historyBytes = 0;
  let pendingDay = '';
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

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

  function flushPending() {
    clearTimeout(timer);
    timer = undefined;
    if (!pendingBytes) return;
    const now = Date.now();
    const day = pendingDay;
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
    const bytes = new Uint8Array(pendingBytes);
    let offset = 0;
    for (const part of pending) {
      bytes.set(part, offset);
      offset += part.length;
    }
    let file = new File(directory, `app-error.${day}.log${shard ? `.${shard}` : ''}`);
    if (file.exists && file.size + bytes.length > MAX_FILE_BYTES) {
      file = new File(directory, `app-error.${day}.log.${++shard}`);
    }
    appendBytes(file, bytes);
    historyBytes += bytes.length;
    // Clear committed records before pruning, which can fail independently of the append.
    pending = [];
    pendingBytes = 0;
    if (historyBytes > MAX_HISTORY_BYTES) prune(now);
  }

  const aggregate = createDiagnosticLogAggregator((safe) => {
    if (Date.parse(safe.timestamp) < Date.now() - MAX_AGE_MS) return;
    const day = safe.timestamp.slice(0, 10);
    const bytes = encoder.encode(`${JSON.stringify(safe)}\n`);
    if (pendingDay !== day || pendingBytes + bytes.length > MAX_PENDING_BYTES) flushPending();
    pendingDay = day;
    pending.push(bytes);
    pendingBytes += bytes.length;

    // Preserve lifecycle events without opening and closing a file at each milestone.
    // Errors still persist synchronously, including any preceding startup context.
    if (safe.level !== 'info') {
      try {
        flushPending();
      } catch (error) {
        // The aggregator owns retries for error summaries; do not also retain their bytes.
        if (pending.at(-1) === bytes) {
          pending.pop();
          pendingBytes -= bytes.length;
        }
        throw error;
      }
    } else {
      timer ??= setTimeout(() => {
        try {
          flushPending();
        } catch {
          // Keep the bounded batch for the next event or explicit flush; never log recursively.
        }
      }, INFO_FLUSH_DELAY_MS);
    }
  });
  return Object.assign(
    (record: LogRecord) => {
      const safe = projectDiagnosticLog(record);
      if (safe) aggregate(safe);
    },
    {
      flush: () => {
        aggregate.flush();
        flushPending();
      },
    },
  );
}
