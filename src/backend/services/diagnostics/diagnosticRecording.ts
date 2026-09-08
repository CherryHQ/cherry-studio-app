import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { type LogRecord } from '@/shared/core/logger/LoggerService';

import { appendBytes, diagnosticDirectory, serializeDiagnosticRecord } from './diagnosticFiles';

const MAX_LOG_BYTES = 10 * 1024 * 1024;
const encoder = new TextEncoder();

function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Process-owned writer: no open handles, timers, or dependency on database startup. */
export function createDiagnosticLogWriter(): (record: LogRecord) => void {
  const directory = diagnosticDirectory('logs');
  let currentDay = '';
  const shards = new Map<string, number>();

  return (record) => {
    const now = new Date(record.timestamp);
    const day = localDate(now);
    if (day !== currentDay) {
      directory.create({ intermediates: true, idempotent: true });
      shards.clear();
      for (const entry of directory.list()) {
        if (!(entry instanceof File)) continue;
        const match = /^(app(?:-error)?)\.(\d{4}-\d{2}-\d{2})\.log(?:\.(\d+))?$/.exec(entry.name);
        if (!match) continue;
        const retention = (match[1] === 'app-error' ? 60 : 30) * 86400000;
        if (Date.parse(`${match[2]}T00:00:00`) < now.getTime() - retention) {
          try {
            entry.delete();
          } catch {
            /* Retry cleanup on the next date. */
          }
        } else if (match[2] === day) {
          shards.set(match[1], Math.max(shards.get(match[1]) ?? 0, Number(match[3] ?? 0)));
        }
      }
      currentDay = day;
    }
    const isError = record.level === 'error' || record.level === 'warn';
    const bytes = encoder.encode(
      `${serializeDiagnosticRecord(
        isError
          ? {
              ...record,
              sys: `${Platform.OS} ${Platform.Version}`,
              appVersion: Constants.expoConfig?.version,
            }
          : record,
      )}\n`,
    );
    for (const prefix of isError ? ['app', 'app-error'] : ['app']) {
      let shard = shards.get(prefix) ?? 0;
      let file = new File(directory, `${prefix}.${day}.log${shard ? `.${shard}` : ''}`);
      if (file.exists && file.size > 0 && file.size + bytes.length > MAX_LOG_BYTES) {
        shard += 1;
        shards.set(prefix, shard);
        file = new File(directory, `${prefix}.${day}.log.${shard}`);
      }
      appendBytes(file, bytes);
    }
  };
}
