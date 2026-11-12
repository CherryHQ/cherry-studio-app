import { File } from 'expo-file-system';

import type { DbService } from '@/backend/data/db/DbService';
import { hashLocalFile } from '@/backend/services/file/fileHash';
import type { BackupState } from '@/shared/contracts/backup';

import { packBackup } from '../backupArchive';
import { captureResources } from '../backupResources';
import { BackupRuntime } from '../BackupRuntime';

jest.mock('../../../../../modules/backup-storage', () => ({
  getBackupStorage: () => ({ processId: () => '10000000-0000-4000-8000-000000000001' }),
}));
jest.mock('@/backend/data/storage/storagePaths', () => ({
  backupStorageNative: () => ({ processId: () => '10000000-0000-4000-8000-000000000001' }),
  getStorageBoot: () => ({ restartRequired: false }),
  takeStorageOutcome: () => undefined,
  databaseDirectory: () => ({ uri: 'file:///storage/database' }),
  storageDirectory: () => ({ uri: 'file:///storage' }),
}));
jest.mock('@/backend/data/db/backupDatabase', () => ({
  bundledBackupVersion: async () => ({
    migrations: [{ when: 1789461429602, sha256: 'a'.repeat(64) }],
  }),
  captureDatabase: async () => {},
  normalizeBackupDatabase: async () => {},
}));
jest.mock('@/backend/services/file/fileHash', () => ({ hashLocalFile: jest.fn() }));
jest.mock('../backupArchive', () => ({
  ...jest.requireActual<typeof import('../backupArchive')>('../backupArchive'),
  packBackup: jest.fn(),
}));
jest.mock('../backupResources', () => ({
  ...jest.requireActual<typeof import('../backupResources')>('../backupResources'),
  captureResources: jest.fn(),
}));
jest.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    exists = false;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get size() {
      return mockFileSizes.get(this.uri) ?? 0;
    }
    writeSync(data: string) {
      mockFileSizes.set(this.uri, new TextEncoder().encode(data).length);
    }
    create() {
      this.exists = true;
    }
    delete() {
      this.exists = false;
    }
  }
  return {
    Directory: Entry,
    File: Entry,
    Paths: { cache: 'file:///cache/', availableDiskSpace: 2 ** 40 },
  };
});

const mockFileSizes = new Map<string, number>();

test('publishes progress through its own state rather than the lifecycle state', async () => {
  const runtime = new BackupRuntime({} as DbService);
  const phases: string[] = [];
  runtime.subscribe(() => phases.push(runtime.getState().phase));

  await expect(runtime.prepareRestore('file:///picked/backup.zip')).rejects.toMatchObject({
    code: 'invalid',
  });

  expect(phases).toEqual(['validating', 'idle']);
  expect(runtime.getState()).toEqual({ phase: 'idle', completed: 0, total: 0 });
});

test('keeps a fixed two-pass byte scale across hashing and packing with percentage deduplication', async () => {
  const runtime = new BackupRuntime({ getSqlite: () => ({}) } as DbService);
  runtime.configure(
    () => false,
    () => {},
  );
  const states: BackupState[] = [];
  runtime.subscribe(() => states.push(runtime.getState()));
  const payloadBytes = 256 * 1024;
  const attachmentPath = 'files/10000000-0000-4000-8000-000000000001.png';
  let attachmentUri = '';
  jest.mocked(captureResources).mockImplementation(async (_source, target) => {
    mockFileSizes.set(new File(target, 'database', 'cherry.db').uri, 64 * 1024);
    attachmentUri = new File(target, 'files', '10000000-0000-4000-8000-000000000001.png').uri;
    mockFileSizes.set(attachmentUri, 192 * 1024);
    return {
      paths: ['database/cherry.db', attachmentPath],
      counts: { sessions: 0, messages: 0, files: 1, pluginConnections: 0 },
    };
  });
  const hashStarts: number[] = [];
  jest.mocked(hashLocalFile).mockImplementation(async () => {
    hashStarts.push(runtime.getState().completed);
    // Later metadata changes must not alter the inventory or manifest's pinned sizes.
    mockFileSizes.set(attachmentUri, 1);
    return 'a'.repeat(64);
  });
  const packedCompleted: number[] = [];
  jest
    .mocked(packBackup)
    .mockImplementation(async (_root, manifest, _output, _signal, progress) => {
      expect(manifest.formatVersion).toBe(4);
      expect(manifest.entries.map(({ size }) => size)).toEqual([64 * 1024, 192 * 1024]);
      const before = states.length;
      for (const done of [0, 0, 1]) progress(done, payloadBytes);
      expect(states).toHaveLength(before);
      packedCompleted.push(runtime.getState().completed);
      progress(128 * 1024, payloadBytes);
      packedCompleted.push(runtime.getState().completed);
      progress(payloadBytes, payloadBytes);
      packedCompleted.push(runtime.getState().completed);
    });

  await runtime.createBackup();

  expect(hashStarts).toEqual([0, 64 * 1024]);
  expect(packedCompleted).toEqual([256 * 1024, 384 * 1024, 512 * 1024]);
  const packing = states.filter(({ phase }) => phase === 'packing');
  expect(packing.map(({ completed }) => completed)).toEqual([
    0,
    64 * 1024,
    256 * 1024,
    384 * 1024,
    512 * 1024,
  ]);
  for (const [index, state] of packing.entries()) {
    expect(state.total).toBe(512 * 1024);
    expect(state.completed).toBeGreaterThanOrEqual(index === 0 ? 0 : packing[index - 1]!.completed);
    expect(state.completed).toBeLessThanOrEqual(state.total);
  }
  expect(states[0]).toEqual({ phase: 'capturing', completed: 0, total: 0 });
  expect(states.at(-1)).toMatchObject({ phase: 'exported', completed: 0, total: 0 });
});

test.each([0, 1])('handles a zero-byte inventory with pack total %i', async (packTotal) => {
  const runtime = new BackupRuntime({ getSqlite: () => ({}) } as DbService);
  runtime.configure(
    () => false,
    () => {},
  );
  const states: BackupState[] = [];
  runtime.subscribe(() => states.push(runtime.getState()));
  jest.mocked(captureResources).mockImplementation(async (_source, target) => {
    mockFileSizes.set(new File(target, 'database', 'cherry.db').uri, 0);
    return {
      paths: ['database/cherry.db'],
      counts: { sessions: 0, messages: 0, files: 0, pluginConnections: 0 },
    };
  });
  jest.mocked(hashLocalFile).mockResolvedValue('a'.repeat(64));
  jest
    .mocked(packBackup)
    .mockImplementation(async (_root, _manifest, _output, _signal, progress) => {
      progress(0, packTotal);
    });

  if (packTotal === 0) await expect(runtime.createBackup()).resolves.toHaveProperty('uri');
  else await expect(runtime.createBackup()).rejects.toMatchObject({ code: 'invalid' });

  expect(states.filter(({ phase }) => phase === 'packing')).toEqual([
    { phase: 'packing', completed: 0, total: 0 },
  ]);
  expect(states.at(-1)).toMatchObject({
    phase: packTotal === 0 ? 'exported' : 'idle',
    completed: 0,
    total: 0,
  });
});

test('cancels during inventory yield before hashing or determinate progress', async () => {
  jest.useFakeTimers();
  let sizes: jest.SpyInstance | undefined;
  try {
    const runtime = new BackupRuntime({ getSqlite: () => ({}) } as DbService);
    runtime.configure(
      () => false,
      () => {},
    );
    const states: BackupState[] = [];
    runtime.subscribe(() => states.push(runtime.getState()));
    jest.mocked(captureResources).mockImplementation(async () => {
      sizes = jest.spyOn(File.prototype, 'size', 'get');
      return {
        paths: Array.from(
          { length: 129 },
          (_, index) => `files/10000000-0000-4000-8000-${String(index).padStart(12, '0')}.png`,
        ),
        counts: { sessions: 0, messages: 0, files: 129, pluginConnections: 0 },
      };
    });
    jest.mocked(hashLocalFile).mockClear();
    jest.mocked(packBackup).mockClear();
    setTimeout(() => runtime.cancel(), 0);
    const creating = runtime.createBackup();
    const rejected = expect(creating).rejects.toMatchObject({ code: 'cancelled' });
    await jest.runAllTimersAsync();
    await rejected;
    expect(sizes).toHaveBeenCalledTimes(64);
    expect(hashLocalFile).not.toHaveBeenCalled();
    expect(packBackup).not.toHaveBeenCalled();
    expect(states.map(({ phase }) => phase)).toEqual(['capturing', 'idle']);
  } finally {
    sizes?.mockRestore();
    jest.useRealTimers();
  }
});

test.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid captured size %p before hashing or determinate progress',
  async (size) => {
    const runtime = new BackupRuntime({ getSqlite: () => ({}) } as DbService);
    runtime.configure(
      () => false,
      () => {},
    );
    const states: BackupState[] = [];
    runtime.subscribe(() => states.push(runtime.getState()));
    jest.mocked(captureResources).mockImplementation(async (_source, target) => {
      mockFileSizes.set(new File(target, 'database', 'cherry.db').uri, size);
      return {
        paths: ['database/cherry.db'],
        counts: { sessions: 0, messages: 0, files: 0, pluginConnections: 0 },
      };
    });
    jest.mocked(hashLocalFile).mockClear();
    await expect(runtime.createBackup()).rejects.toMatchObject({ code: 'invalid' });
    expect(hashLocalFile).not.toHaveBeenCalled();
    expect(states.map(({ phase }) => phase)).toEqual(['capturing', 'idle']);
  },
);
