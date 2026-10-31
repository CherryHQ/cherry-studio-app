import { randomUUID } from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { deleteAsync, getInfoAsync, readDirectoryAsync } from 'expo-file-system/legacy';

import { profileRoot } from '@/backend/data/storage/storagePaths';
import { createDiagnosticTemporaryDirectory } from '@/backend/utils/diagnosticTemporaryFiles';

import type { TraceFileStorage } from './types';

export const TRACE_RETENTION = Object.freeze({
  scope: 'installation' as const,
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  maxBytes: 20 * 1024 * 1024,
  maxFiles: 512,
});

const TRACE_FILE_NAME = /^(\d+)-[0-9a-f-]{36}\.jsonl$/;
const TRACE_TEMP_FILE_NAME = /^\d+-[0-9a-f-]{36}\.jsonl\.tmp$/;
const PROFILE_DIRECTORY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function traceDirectory(): Directory {
  return new Directory(profileRoot(), 'Runtime', 'trace', 'v1');
}

// Directory.list() and File.size synchronously inspect native files. Use the
// legacy asynchronous APIs to keep full history scans off the chat JS thread.
async function traceEntries(directory: Directory): Promise<string[]> {
  return (await getInfoAsync(directory.uri)).exists ? readDirectoryAsync(directory.uri) : [];
}

async function historyFiles(
  directory: Directory,
  entries: readonly string[],
): Promise<{ name: string; uri: string; timestamp: number; size: number }[]> {
  const directoryUri = directory.uri;
  const files = await Promise.all(
    entries.map(async (name) => {
      const match = TRACE_FILE_NAME.exec(name);
      if (!match) return [];
      const uri = `${directoryUri}${name}`;
      const info = await getInfoAsync(uri);
      return info.exists && !info.isDirectory
        ? [{ name, uri, timestamp: Number(match[1]), size: info.size }]
        : [];
    }),
  );
  return files.flat();
}

/** The service queue serializes appends, retention and snapshot copies. */
export const traceFileStorage: TraceFileStorage = {
  async writeBatch(lines, now) {
    if (!lines.length) return;
    const directory = traceDirectory();
    directory.create({ intermediates: true, idempotent: true });
    const bytes = encoder.encode(`${lines.join('\n')}\n`);
    const latest = (await historyFiles(directory, await readDirectoryAsync(directory.uri)))
      .filter(({ timestamp }) => Math.floor(timestamp / DAY_MS) === Math.floor(now / DAY_MS))
      .sort(
        (left, right) => right.timestamp - left.timestamp || right.name.localeCompare(left.name),
      )[0];
    if (latest && latest.size + bytes.length + 1 <= MAX_FILE_BYTES) {
      const handle = new File(latest.uri).open(FileMode.ReadWrite);
      try {
        // Isolate an interrupted final line so it cannot consume the next valid record.
        if (latest.size) {
          handle.offset = latest.size - 1;
          if (handle.readBytesSync(1)[0] !== 0x0a) handle.writeBytesSync(new Uint8Array([0x0a]));
        }
        const size = handle.size;
        if (size === null) throw new Error('Trace file is not writable');
        handle.offset = size;
        handle.writeBytesSync(bytes);
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
      temporary.writeSync(bytes);
      await temporary.move(destination);
      committed = true;
    } finally {
      if (!committed && temporary.exists) temporary.delete();
    }
  },

  async prune(now) {
    // Retention spans the installation, independently of the active profile or registry health.
    // Only known trace filenames in these exact directories are eligible for deletion.
    const directories = [new Directory(Paths.document, 'Runtime', 'trace', 'v1')];
    const profiles = new Directory(Paths.document, 'profiles');
    if ((await getInfoAsync(profiles.uri)).exists) {
      for (const id of await readDirectoryAsync(profiles.uri)) {
        if (PROFILE_DIRECTORY.test(id))
          directories.push(new Directory(profiles, id, 'Runtime', 'trace', 'v1'));
      }
    }
    const files: Awaited<ReturnType<typeof historyFiles>> = [];
    for (const directory of directories) {
      const entries = await traceEntries(directory);
      for (const name of entries) {
        if (!TRACE_TEMP_FILE_NAME.test(name)) continue;
        const uri = `${directory.uri}${name}`;
        const info = await getInfoAsync(uri);
        if (info.exists && !info.isDirectory) await deleteAsync(uri, { idempotent: true });
      }
      files.push(...(await historyFiles(directory, entries)));
    }
    files.sort(
      (left, right) => right.timestamp - left.timestamp || right.uri.localeCompare(left.uri),
    );
    let retainedBytes = 0;
    let retainedFiles = 0;
    for (const { uri, timestamp, size } of files) {
      if (
        timestamp < now - TRACE_RETENTION.maxAgeMs ||
        retainedBytes + size > TRACE_RETENTION.maxBytes ||
        retainedFiles >= TRACE_RETENTION.maxFiles
      ) {
        await deleteAsync(uri, { idempotent: true });
      } else {
        retainedBytes += size;
        retainedFiles += 1;
      }
    }
  },

  async snapshot(now, diagnostics) {
    await this.prune(now);
    const directory = createDiagnosticTemporaryDirectory(`trace-${randomUUID()}`);
    try {
      const active = traceDirectory();
      const sources = (await historyFiles(active, await traceEntries(active))).sort(
        (left, right) => left.timestamp - right.timestamp || left.name.localeCompare(right.name),
      );
      const files: { name: string; uri: string; size: number }[] = [];
      for (const { name, uri, size } of sources) {
        const copy = new File(directory, name);
        await new File(uri).copy(copy);
        files.push({ name, uri: copy.uri, size });
      }
      const manifest = new File(directory, 'manifest.json');
      manifest.create();
      manifest.writeSync(
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
