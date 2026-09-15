import { randomUUID } from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import type { TraceFileStorage } from './types';

export const TRACE_RETENTION = Object.freeze({
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  maxBytes: 20 * 1024 * 1024,
  maxFiles: 512,
});

const TRACE_FILE_NAME = /^(\d+)-[0-9a-f-]{36}\.jsonl$/;
const TRACE_TEMP_FILE_NAME = /^\d+-[0-9a-f-]{36}\.jsonl\.tmp$/;
const MAX_FILE_BYTES = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function traceDirectory(): Directory {
  return new Directory(Paths.document, 'Runtime', 'trace', 'v1');
}

function historyFiles(): { file: File; timestamp: number; size: number }[] {
  const directory = traceDirectory();
  if (!directory.exists) return [];
  return directory.list().flatMap((entry) => {
    const match = TRACE_FILE_NAME.exec(entry.name);
    return entry instanceof File && match
      ? [{ file: entry, timestamp: Number(match[1]), size: entry.size }]
      : [];
  });
}

/** The service queue serializes appends, retention and snapshot copies. */
export const traceFileStorage: TraceFileStorage = {
  async writeBatch(lines, now) {
    if (!lines.length) return;
    const directory = traceDirectory();
    directory.create({ intermediates: true, idempotent: true });
    const bytes = encoder.encode(`${lines.join('\n')}\n`);
    const latest = historyFiles()
      .filter(({ timestamp }) => Math.floor(timestamp / DAY_MS) === Math.floor(now / DAY_MS))
      .sort(
        (left, right) =>
          right.timestamp - left.timestamp || right.file.name.localeCompare(left.file.name),
      )[0];
    if (latest && latest.size + bytes.length + 1 <= MAX_FILE_BYTES) {
      const handle = latest.file.open(FileMode.ReadWrite);
      try {
        // Isolate an interrupted final line so it cannot consume the next valid record.
        if (latest.size) {
          handle.offset = latest.size - 1;
          if (handle.readBytes(1)[0] !== 0x0a) handle.writeBytes(new Uint8Array([0x0a]));
        }
        const size = handle.size;
        if (size === null) throw new Error('Trace file is not writable');
        handle.offset = size;
        handle.writeBytes(bytes);
      } finally {
        handle.close();
      }
      return;
    }
    const destination = new File(directory, `${now}-${randomUUID()}.jsonl`);
    const temporary = new File(directory, `${destination.name}.tmp`);
    let committed = false;
    try {
      temporary.create();
      temporary.write(bytes);
      await temporary.move(destination);
      committed = true;
    } finally {
      if (!committed && temporary.exists) temporary.delete();
    }
  },

  async prune(now) {
    const directory = traceDirectory();
    if (!directory.exists) return;
    for (const entry of directory.list()) {
      if (entry instanceof File && TRACE_TEMP_FILE_NAME.test(entry.name)) entry.delete();
    }
    const files = historyFiles().sort(
      (left, right) =>
        right.timestamp - left.timestamp || right.file.name.localeCompare(left.file.name),
    );
    let retainedBytes = 0;
    let retainedFiles = 0;
    for (const { file, timestamp, size } of files) {
      if (
        timestamp < now - TRACE_RETENTION.maxAgeMs ||
        retainedBytes + size > TRACE_RETENTION.maxBytes ||
        retainedFiles >= TRACE_RETENTION.maxFiles
      ) {
        file.delete();
      } else {
        retainedBytes += size;
        retainedFiles += 1;
      }
    }
  },

  async snapshot(now, diagnostics) {
    await this.prune(now);
    const directory = new Directory(Paths.cache, 'diagnostics', `trace-${randomUUID()}`);
    directory.create({ intermediates: true });
    try {
      const sources = historyFiles().sort(
        (left, right) =>
          left.timestamp - right.timestamp || left.file.name.localeCompare(right.file.name),
      );
      const files: { name: string; uri: string; size: number }[] = [];
      for (const { file } of sources) {
        const copy = new File(directory, file.name);
        await file.copy(copy);
        files.push({ name: copy.name, uri: copy.uri, size: copy.size });
      }
      const manifest = new File(directory, 'manifest.json');
      manifest.create();
      manifest.write(
        JSON.stringify({
          schemaVersion: 1,
          capture: 'metadata',
          createdAt: now,
          retention: TRACE_RETENTION,
          diagnostics,
          files: files.map(({ name, size }) => ({ name, size })),
        }),
      );
      files.push({ name: manifest.name, uri: manifest.uri, size: manifest.size });
      return {
        directoryUri: directory.uri,
        files,
        metadata: {
          capture: 'metadata',
          retention: TRACE_RETENTION,
          diagnostics: { ...diagnostics },
        },
        dispose() {
          if (directory.exists) directory.delete();
        },
      };
    } catch (error) {
      if (directory.exists) directory.delete();
      throw error;
    }
  },
};
