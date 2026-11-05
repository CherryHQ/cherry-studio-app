import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type AgentUploadState } from '@cherrystudio/remote-protocol/agent';

import { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { RemoteAgentError } from '../RemoteAgentError';
import { RemoteAttachmentDrafts } from '../RemoteAttachmentDrafts';
import { integrity, type AgentRequest } from '../remoteContent';
import {
  createAttachmentDownloader,
  downloadAttachment,
  createWorkspaceFileDownloader,
  downloadWorkspaceFile,
  getRemoteAttachmentCacheSize,
  clearRemoteAttachmentCache,
  pruneRemoteAttachmentCache,
  activeTransfers,
} from '../remoteDownloads';
import { uploadAttachments, type SavedUpload, type RemoteUploadFiles } from '../remoteUploads';

const mockNativeReads: number[] = [];
let mockCacheRoot = '';

jest.mock('expo-file-system', () => {
  const fs = jest.requireActual<typeof import('node:fs')>('node:fs');
  const path = jest.requireActual<typeof import('node:path')>('node:path');
  const location = (parts: any[]) =>
    path.join(...parts.map((part) => (typeof part === 'string' ? part : (part?.uri ?? part))));
  class Directory {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = location(parts);
    }
    get name() {
      return path.basename(this.uri);
    }
    get exists() {
      return fs.existsSync(this.uri);
    }
    create() {
      fs.mkdirSync(this.uri, { recursive: true });
    }
    delete() {
      fs.rmSync(this.uri, { recursive: true, force: true });
    }
    list() {
      if (!this.exists) return [];
      const entries = fs.readdirSync(this.uri, { withFileTypes: true });
      return entries.map((entry: any) =>
        entry.isDirectory() ? new Directory(this.uri, entry.name) : new File(this.uri, entry.name),
      );
    }
  }
  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = location(parts);
    }
    get name() {
      return path.basename(this.uri);
    }
    get exists() {
      return fs.existsSync(this.uri);
    }
    get size() {
      return fs.statSync(this.uri).size;
    }
    create() {
      fs.writeFileSync(this.uri, '');
    }
    delete() {
      fs.rmSync(this.uri, { force: true });
    }
    moveSync(destination: File) {
      fs.renameSync(this.uri, destination.uri);
      this.uri = destination.uri;
    }
    open() {
      const fd = fs.openSync(this.uri, 'r+');
      return {
        offset: 0,
        readBytesSync(size: number) {
          mockNativeReads.push(size);
          if (size > 1024 * 1024) throw new Error('Unbounded native read');
          const bytes = Buffer.alloc(size);
          const count = fs.readSync(fd, bytes, 0, size, this.offset);
          this.offset += count;
          return bytes.subarray(0, count);
        },
        writeBytesSync(bytes: Uint8Array) {
          this.offset += fs.writeSync(fd, bytes, 0, bytes.length, this.offset);
        },
        close() {
          fs.closeSync(fd);
        },
      };
    }
  }
  return {
    File,
    Directory,
    Paths: {
      get cache() {
        return mockCacheRoot;
      },
    },
  };
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'mobile-transfer-'));
  mockCacheRoot = root;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const attachment = {
  fileEntryId: FileEntryIdSchema.parse('12345678-1234-4234-8234-123456789abc'),
  name: 'archive.zip',
  mediaType: 'application/zip',
};

it('downloads exact binary bytes in bounded windows and rejects a corrupt final digest', async () => {
  const bytes = Buffer.alloc(24_576 * 9 + 5, 192);
  const ref = {
    contentId: 'message:0',
    revision: '1',
    byteLength: String(bytes.length),
    sha256: integrity.sha256(bytes),
    mediaType: 'application/zip',
  };
  let corrupt = false;
  const request = (async (_method: string, params: any) => {
    const start = Number(params.offset);
    const chunk = Buffer.from(bytes.subarray(start, start + params.maxBytes));
    if (corrupt && start === 0) chunk[0] = 0;
    return {
      contentId: ref.contentId,
      revision: ref.revision,
      sha256: ref.sha256,
      offset: String(start),
      nextOffset: String(start + chunk.length),
      eof: start + chunk.length === bytes.length,
      dataBase64: chunk.toString('base64'),
    };
  }) as AgentRequest;
  const uri = await downloadAttachment(
    request,
    'session',
    ref,
    'archive.zip',
    new AbortController().signal,
  );
  try {
    expect(readFileSync(uri)).toEqual(bytes);
  } finally {
    rmSync(path.dirname(uri), { recursive: true });
  }
  corrupt = true;
  await expect(
    downloadAttachment(request, 'session', ref, '../escape.zip', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' });
});

it('reuses verified downloads across reopen and scope recreation, isolates desktops and redownloads evicted files', async () => {
  const bytes = Buffer.from('verified original bytes');
  const ref = {
    contentId: root,
    revision: '1',
    byteLength: String(bytes.length),
    sha256: integrity.sha256(bytes),
    mediaType: 'text/plain',
  };
  let reads = 0;
  const request = (async () => {
    reads++;
    return {
      ...ref,
      offset: '0',
      nextOffset: String(bytes.length),
      eof: true,
      dataBase64: bytes.toString('base64'),
    };
  }) as AgentRequest;
  const download = createAttachmentDownloader();
  const read = (fn = download, binding = 'desktop-a') =>
    fn(binding, request, 's', ref, 'original.txt', new AbortController().signal);
  const [first, concurrent] = await Promise.all([read(), read()]);
  expect(first).toBe(concurrent);
  expect(await read()).toBe(first);
  expect(await read(createAttachmentDownloader())).toBe(first);
  expect(reads).toBe(1);
  expect(readFileSync(first)).toEqual(bytes);
  const other = await read(download, 'desktop-b');
  expect(other).not.toBe(first);
  expect(reads).toBe(2);
  rmSync(first);
  expect(await read()).toBe(first);
  expect(reads).toBe(3);
  for (const uri of [first, other]) rmSync(path.dirname(uri), { recursive: true, force: true });
});

it('closing one consumer does not cancel a shared download, while closing all keeps partial bytes on disk', async () => {
  const bytes = Buffer.from('shared');
  const ref = {
    contentId: root,
    revision: '2',
    byteLength: String(bytes.length),
    sha256: integrity.sha256(bytes),
    mediaType: 'text/plain',
  };
  let reply!: () => void;
  let transferSignal!: AbortSignal;
  const request = (async (_method: unknown, _params: unknown, signal: AbortSignal) => {
    transferSignal = signal;
    await new Promise<void>((resolve) => {
      reply = resolve;
    });
    return {
      ...ref,
      offset: '0',
      nextOffset: String(bytes.length),
      eof: true,
      dataBase64: bytes.toString('base64'),
    };
  }) as AgentRequest;
  const download = createAttachmentDownloader();
  const first = new AbortController();
  const second = new AbortController();
  const a = download('pc', request, 's', ref, 'shared.txt', first.signal);
  const rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
  const b = download('pc', request, 's', ref, 'shared.txt', second.signal);
  await Promise.resolve();
  first.abort();
  await rejected;
  expect(transferSignal.aborted).toBe(false);
  reply();
  const uri = await b;
  expect(readFileSync(uri)).toEqual(bytes);
  rmSync(path.dirname(uri), { recursive: true, force: true });

  const last = new AbortController();
  const c = download('pc', request, 's', ref, 'shared.txt', last.signal);
  const cancelled = expect(c).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  last.abort();
  await cancelled;
  expect(transferSignal.aborted).toBe(true);
  reply();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(existsSync(path.dirname(uri)) ? readdirSync(path.dirname(uri)) : []).toEqual([
    'shared.txt.part',
  ]);
  rmSync(path.dirname(uri), { recursive: true, force: true });
});

it.each([
  { checksumAlgorithm: 'sha256' as const, reorder: false },
  { checksumAlgorithm: 'sha256' as const, reorder: true },
  { checksumAlgorithm: undefined, reorder: false },
  { checksumAlgorithm: undefined, reorder: true },
])(
  'uploads selected bytes and restores readiness with checksum $checksumAlgorithm and reordered fields $reorder',
  async ({ checksumAlgorithm: initialChecksumAlgorithm, reorder }) => {
    let checksumAlgorithm = initialChecksumAlgorithm;
    const uri = path.join(root, 'selected.zip');
    const bytes = Buffer.from('selected before Send');
    writeFileSync(uri, bytes);
    const storage = new Map<string, string>();
    const journal = new RemoteAgentCommandJournal({
      getString: (key) => storage.get(key),
      set: (key, value) => {
        storage.set(key, String(value));
      },
      remove: (key) => storage.delete(key),
      getAllKeys: () => [...storage.keys()],
    });
    let draft: any;
    let upload: AgentUploadState | undefined;
    const received: Buffer[] = [];
    const cancelled: string[] = [];
    const request = (async (method: string, params: any) => {
      params = JSON.parse(JSON.stringify(params));
      if (method === 'agent.attachments.present') {
        draft = params;
        return { accepted: true };
      }
      if (method === 'agent.uploads.get') {
        if (!upload) throw new RemoteAgentError('NOT_FOUND');
        return upload;
      }
      if (method === 'agent.uploads.cancel') {
        cancelled.push(params.uploadId);
        upload = undefined;
        received.length = 0;
        return { cancelled: true };
      }
      if (method === 'agent.uploads.prepare') {
        expect(draft.items[0].uploadId).toBe(params.uploadId);
        expect(params.draftId).toBeUndefined();
        expect(params.checksumAlgorithm).toBe(checksumAlgorithm);
        if (!checksumAlgorithm) expect(params).not.toHaveProperty('checksumAlgorithm');
        upload = {
          uploadId: params.uploadId,
          state: 'receiving',
          ...(checksumAlgorithm ? { checksumAlgorithm } : {}),
          committedOffset: '0',
          writerEpoch: '0',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        };
      } else if (method === 'agent.uploads.resume') upload = { ...upload!, writerEpoch: '1' };
      else if (method === 'agent.uploads.complete') {
        if (checksumAlgorithm) expect(params.expectedSha256).toBe(integrity.sha256(bytes));
        else expect(params).not.toHaveProperty('expectedSha256');
        upload = { ...upload!, state: 'ready', sha256: integrity.sha256(Buffer.concat(received)) };
      } else throw new Error(`Selection must not send a message: ${method}`);
      return reorder ? Object.fromEntries(Object.entries(upload!).toReversed()) : upload;
    }) as AgentRequest;
    const transport = async () => ({
      checksumAlgorithm,
      write: async (input: any) => {
        received.push(Buffer.from(input.bytes));
        upload = { ...upload!, committedOffset: String(Buffer.concat(received).length) };
        return { ok: true as const, requestId: 'ack', ...upload };
      },
    });
    const files = {
      hashFile: jest.fn(async () => integrity.sha256(readFileSync(uri))),
      resolve: async () => ({ uri, entry: { id: attachment.fileEntryId, provenance: 'imported' } }),
      prepareUploadSource: async () => ({
        uri,
        entry: { id: attachment.fileEntryId, provenance: 'imported' },
      }),
    } as unknown as RemoteUploadFiles;
    let tasks = new RemoteAttachmentDrafts(
      'phone:grant:attachments',
      journal,
      files,
      request,
      new AbortController().signal,
      () => {},
      transport,
    );
    tasks.stage('session:session', { sessionId: 'session' }, [attachment]);
    expect(tasks.get()[0].items[0].state).toBe('uploading');
    expect(() => tasks.ready('session:session', [attachment])).toThrow();
    await tasks.drain();
    expect(Buffer.concat(received).equals(bytes)).toBe(true);
    const ready = tasks.ready('session:session', [attachment]);
    tasks.stop();
    tasks = new RemoteAttachmentDrafts(
      'phone:grant:attachments',
      journal,
      files,
      request,
      new AbortController().signal,
      () => {},
      transport,
    );
    tasks.recover();
    await tasks.drain();
    expect(tasks.ready('session:session', [attachment])).toEqual(ready);
    expect(Buffer.concat(received).equals(bytes)).toBe(true);
    expect(jest.mocked(files.hashFile)).toHaveBeenCalledTimes(checksumAlgorithm ? 2 : 0);
    tasks.stop();
    checksumAlgorithm = checksumAlgorithm ? undefined : 'sha256';
    tasks = new RemoteAttachmentDrafts(
      'phone:grant:attachments',
      journal,
      files,
      request,
      new AbortController().signal,
      () => {},
      transport,
    );
    tasks.recover();
    await tasks.drain();
    const migrated = tasks.ready('session:session', [attachment]);
    expect(migrated.selectionId).toBe(ready.selectionId);
    expect(migrated.uploaded[0].uploadId).not.toBe(ready.uploaded[0].uploadId);
    expect(cancelled).toEqual([ready.uploaded[0].uploadId]);
    expect(Buffer.concat(received).equals(bytes)).toBe(true);
    expect(jest.mocked(files.hashFile)).toHaveBeenCalledTimes(initialChecksumAlgorithm ? 2 : 1);
    tasks.reconcile(new Set([ready.selectionId]));
    tasks.stop();
    const admitted = new RemoteAttachmentDrafts(
      'phone:grant:attachments',
      journal,
      files,
      (async () => {
        throw new Error('Admitted drafts must recover through the command journal');
      }) as AgentRequest,
      new AbortController().signal,
      () => {},
      transport,
    );
    admitted.recover();
    await admitted.drain();
    expect(admitted.get()).toEqual([]);
    admitted.stop();
  },
);

it('persists removal before abort and cannot revive the attachment from a late write after restart', async () => {
  const uri = path.join(root, 'remove.zip');
  writeFileSync(uri, 'removed attachment');
  const storage = new Map<string, string>();
  const journal = new RemoteAgentCommandJournal({
    getString: (key) => storage.get(key),
    set: (key, value) => {
      storage.set(key, String(value));
    },
    remove: (key) => storage.delete(key),
    getAllKeys: () => [...storage.keys()],
  });
  let started!: () => void;
  const writing = new Promise<void>((resolve) => {
    started = resolve;
  });
  let reply!: () => void;
  const pending = new Promise<void>((resolve) => {
    reply = resolve;
  });
  let draft: any;
  let upload: AgentUploadState;
  const request = (async (method: string, params: any) => {
    switch (method) {
      case 'agent.attachments.present':
        draft = params;
        return { accepted: true };
      case 'agent.uploads.cancel':
        return { cancelled: true };
      case 'agent.uploads.get':
        throw new RemoteAgentError('NOT_FOUND');
      case 'agent.uploads.prepare':
        upload = {
          uploadId: params.uploadId,
          state: 'receiving',
          checksumAlgorithm: 'sha256',
          committedOffset: '0',
          writerEpoch: '0',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        };
        return upload;
      case 'agent.uploads.resume':
        return { ...upload, writerEpoch: '1' };
      default:
        throw new Error(`Removed attachment must not complete or send: ${method}`);
    }
  }) as AgentRequest;
  const transport = async () => ({
    checksumAlgorithm: 'sha256' as const,
    write: async (input: any) => {
      started();
      await pending;
      return {
        ok: true as const,
        requestId: 'ack',
        ...upload,
        writerEpoch: '1',
        committedOffset: String(input.bytes.length),
      };
    },
  });
  const files = {
    hashFile: async () => integrity.sha256(readFileSync(uri)),
    resolve: async () => ({ uri, entry: { id: attachment.fileEntryId, provenance: 'imported' } }),
    prepareUploadSource: async () => ({
      uri,
      entry: { id: attachment.fileEntryId, provenance: 'imported' },
    }),
  } as unknown as RemoteUploadFiles;
  let tasks = new RemoteAttachmentDrafts(
    'removal',
    journal,
    files,
    request,
    new AbortController().signal,
    () => {},
    transport,
  );
  tasks.stage('session:session', { sessionId: 'session' }, [attachment]);
  await writing;
  tasks.stage('session:session', { sessionId: 'session' }, []);
  tasks.stop();
  reply();
  await tasks.drain();
  tasks = new RemoteAttachmentDrafts(
    'removal',
    journal,
    files,
    request,
    new AbortController().signal,
    () => {},
    transport,
  );
  tasks.recover();
  await tasks.drain();
  expect(draft.items).toEqual([]);
  expect(tasks.get()).toEqual([]);
  tasks.stop();
});

it.each([undefined, 'sha256'] as const)(
  'resumes exact binary bytes from the persisted snapshot after a lost ACK with checksum %s',
  async (checksumAlgorithm) => {
    mockNativeReads.length = 0;
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 19, 63);
    const uri = path.join(root, 'snapshot.bin');
    writeFileSync(uri, bytes);
    const snapshotId = '12345678-1234-4234-8234-123456789def';
    const files = {
      hashFile: jest.fn(async () => integrity.sha256(readFileSync(uri))),
      prepareUploadSource: jest.fn(async () => ({
        uri,
        entry: { id: snapshotId, provenance: 'imported' },
      })),
      resolve: async (id: string) => {
        if (id !== snapshotId) throw new Error('Original source must not be reopened');
        return { uri, entry: { id: snapshotId, provenance: 'imported' } };
      },
    } as unknown as RemoteUploadFiles;
    let saved: SavedUpload[] = [];
    let state: AgentUploadState | undefined;
    const received: Uint8Array[] = [];
    let disconnect = true;
    const request = (async (method: string, input: any) => {
      if (method === 'agent.uploads.get') {
        if (!state) throw new RemoteAgentError('NOT_FOUND');
        return state;
      }
      if (method === 'agent.uploads.prepare') {
        expect(input).not.toHaveProperty('sha256');
        expect(input.checksumAlgorithm).toBe(checksumAlgorithm);
        if (!checksumAlgorithm) expect(input).not.toHaveProperty('checksumAlgorithm');
        expect(mockNativeReads).toEqual([]);
        state = {
          uploadId: input.uploadId,
          state: 'receiving',
          ...(checksumAlgorithm ? { checksumAlgorithm } : {}),
          committedOffset: '0',
          writerEpoch: '0',
          expiresAt: new Date().toISOString(),
        };
      } else if (method === 'agent.uploads.resume') {
        state = { ...state!, writerEpoch: String(Number(state!.writerEpoch) + 1) };
      } else if (method === 'agent.uploads.complete') {
        if (checksumAlgorithm) expect(input.expectedSha256).toBe(integrity.sha256(bytes));
        else expect(input).not.toHaveProperty('expectedSha256');
        state = { ...state!, state: 'ready', sha256: integrity.sha256(Buffer.concat(received)) };
      } else throw new Error('Unexpected upload request: ' + method);
      return state;
    }) as AgentRequest;
    const run = () =>
      uploadAttachments(
        [attachment],
        files,
        request,
        new AbortController().signal,
        () => {},
        saved,
        (value) => {
          saved = JSON.parse(JSON.stringify(value));
        },
        async () => ({
          checksumAlgorithm,
          write: async (input) => {
            expect(Number(input.offset)).toBe(Number(state!.committedOffset));
            expect(input.bytes.length).toBeLessThanOrEqual(1024 * 1024);
            received.push(input.bytes);
            state = {
              ...state!,
              committedOffset: String(Number(input.offset) + input.bytes.length),
            };
            if (disconnect) throw new RemoteAgentError('CONNECTION_LOST', true);
            return {
              ok: true,
              requestId: 'ack',
              uploadId: input.uploadId,
              writerEpoch: input.writerEpoch,
              committedOffset: state.committedOffset,
            };
          },
        }),
        'upload',
      );
    await expect(run()).rejects.toMatchObject({ code: 'CONNECTION_LOST' });
    expect(saved[0].sourceFileEntryId).toBe(snapshotId);
    expect(state!.committedOffset).toBe(String(2 * 1024 * 1024));
    disconnect = false;
    await expect(run()).resolves.toEqual([{ uploadId: 'upload' }]);
    expect(Buffer.concat(received).equals(bytes)).toBe(true);
    expect(received.map((chunk) => chunk.length)).toEqual([1048576, 1048576, 19]);
    expect(files.prepareUploadSource).toHaveBeenCalledTimes(1);
    if (!checksumAlgorithm) expect(files.hashFile).not.toHaveBeenCalled();
  },
);

function verifiedUpload() {
  const uri = path.join(root, 'verified.bin');
  writeFileSync(uri, 'source bytes');
  let state: AgentUploadState | undefined;
  let saved: SavedUpload[] = [];
  const writes: number[] = [];
  const completions: string[] = [];
  const files = {
    resolve: async () => ({ uri, entry: { id: attachment.fileEntryId, provenance: 'imported' } }),
    prepareUploadSource: async () => ({
      uri,
      entry: { id: attachment.fileEntryId, provenance: 'imported' },
    }),
    hashFile: jest.fn(async (_id: string, _signal: AbortSignal) =>
      integrity.sha256(readFileSync(uri)),
    ),
  } as unknown as RemoteUploadFiles;
  const request = jest.fn(async (method: string, input: any) => {
    if (method === 'agent.uploads.get') {
      if (!state) throw new RemoteAgentError('NOT_FOUND');
      return state;
    }
    if (method === 'agent.uploads.prepare') {
      state = {
        uploadId: input.uploadId,
        checksumAlgorithm: input.checksumAlgorithm,
        state: 'receiving',
        committedOffset: '0',
        writerEpoch: '0',
        expiresAt: new Date().toISOString(),
      };
    } else if (method === 'agent.uploads.resume') {
      state = { ...state!, writerEpoch: String(Number(state!.writerEpoch) + 1) };
    } else if (method === 'agent.uploads.complete') {
      completions.push(input.expectedSha256);
      state = { ...state!, state: 'ready', sha256: input.expectedSha256 };
    } else throw new Error(method);
    return state;
  });
  const write = jest.fn(async (input: any) => {
    writes.push(Number(input.offset));
    state = { ...state!, committedOffset: String(Number(input.offset) + input.bytes.length) };
    return { ...state, requestId: 'ack', ok: true as const };
  });
  const progress = jest.fn();
  const run = (signal = new AbortController().signal) =>
    uploadAttachments(
      [attachment],
      files,
      request as AgentRequest,
      signal,
      progress,
      saved,
      (value) => {
        saved = structuredClone(value);
      },
      async () => ({ checksumAlgorithm: 'sha256', write }),
    );
  return { uri, files, request, write, progress, run, completions, writes, saved: () => saved };
}

it('starts DATA before native hashing finishes and cannot complete until both readers finish', async () => {
  const task = verifiedUpload();
  let hashDone!: (digest: string) => void;
  jest.mocked(task.files.hashFile).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        hashDone = resolve;
      }),
  );
  const work = task.run();
  while (!task.writes.length) await new Promise((resolve) => setTimeout(resolve, 1));
  await new Promise((resolve) => setTimeout(resolve, 40));
  expect(task.completions).toEqual([]);
  expect(task.progress.mock.calls.at(-1)).toEqual([12, 12, 'verifying']);
  const digest = integrity.sha256(readFileSync(task.uri));
  hashDone(digest);
  await work;
  expect(task.completions).toEqual([digest]);
  expect(task.saved()[0].expectedSha256).toBe(digest);
});

it('rejects a same-size source change before any resume request or DATA', async () => {
  const task = verifiedUpload();
  await task.run();
  writeFileSync(task.uri, 'mutant bytes');
  task.request.mockClear();
  task.writes.length = 0;
  await expect(task.run()).rejects.toMatchObject({ code: 'UPLOAD_SOURCE_CHANGED' });
  expect(task.request.mock.calls).toEqual([]);
  expect(task.writes).toEqual([]);
});

it('aborts and drains native hashing after a lost connection without persisting a late digest', async () => {
  const task = verifiedUpload();
  let hashDone!: (digest: string) => void;
  let nativeCancelled!: () => void;
  const cancelled = new Promise<void>((resolve) => {
    nativeCancelled = resolve;
  });
  jest.mocked(task.files.hashFile).mockImplementationOnce((_id, signal) => {
    signal.addEventListener('abort', nativeCancelled, { once: true });
    return new Promise((resolve) => {
      hashDone = resolve;
    });
  });
  task.write.mockRejectedValueOnce(new RemoteAgentError('CONNECTION_LOST', true));
  let settled = false;
  const work = task.run().finally(() => {
    settled = true;
  });
  const failure = expect(work).rejects.toMatchObject({ code: 'CONNECTION_LOST' });
  await cancelled;
  expect(settled).toBe(false);
  hashDone(integrity.sha256(readFileSync(task.uri)));
  await failure;
  expect(task.saved()[0].expectedSha256).toBeUndefined();
  expect(task.completions).toEqual([]);
});

it('does not accept a ready response with a different desktop digest', async () => {
  const task = verifiedUpload();
  await task.run();
  task.request.mockImplementationOnce(async () => ({
    uploadId: task.saved()[0].metadata.uploadId,
    checksumAlgorithm: 'sha256',
    state: 'ready',
    committedOffset: '12',
    writerEpoch: '1',
    expiresAt: new Date().toISOString(),
    sha256: '0'.repeat(64),
  }));
  await expect(task.run()).rejects.toMatchObject({ code: 'INVALID_ATTACHMENT' });
});

it('rejects an unsupported desktop before retaining, hashing or transmitting source bytes', async () => {
  const task = verifiedUpload();
  await expect(
    uploadAttachments(
      [attachment],
      task.files,
      task.request as AgentRequest,
      new AbortController().signal,
      task.progress,
      [],
      () => {
        throw new Error('Must not persist an unsupported upload');
      },
      async () => {
        throw new RemoteAgentError('UPGRADE_REQUIRED');
      },
    ),
  ).rejects.toMatchObject({ code: 'UPGRADE_REQUIRED' });
  expect(task.request.mock.calls).toEqual([]);
  expect(jest.mocked(task.files.hashFile).mock.calls).toEqual([]);
  expect(task.writes).toEqual([]);
});

it('resumes interrupted download from chunk boundary and verifies full file sha256', async () => {
  const chunkSize = 24_576;
  const bytes = Buffer.alloc(chunkSize * 2, 77);
  const ref = {
    contentId: 'resumable-message:0',
    revision: '1',
    byteLength: String(bytes.length),
    sha256: integrity.sha256(bytes),
    mediaType: 'application/octet-stream',
  };

  const requestedOffsets: number[] = [];
  let shouldFailSecondChunk = true;

  const request = (async (_method: string, params: any) => {
    const start = Number(params.offset);
    requestedOffsets.push(start);
    if (shouldFailSecondChunk && start === chunkSize) {
      throw new RemoteAgentError('CONNECTION_LOST', true);
    }
    const chunk = Buffer.from(bytes.subarray(start, start + params.maxBytes));
    return {
      contentId: ref.contentId,
      revision: ref.revision,
      sha256: ref.sha256,
      offset: String(start),
      nextOffset: String(start + chunk.length),
      eof: start + chunk.length === bytes.length,
      dataBase64: chunk.toString('base64'),
    };
  }) as AgentRequest;

  const cacheKey = 'resumable-test-key';
  // First attempt: chunk 0 succeeds, chunk 1 fails with CONNECTION_LOST
  await expect(
    downloadAttachment(
      request,
      'session',
      ref,
      'resumable.bin',
      new AbortController().signal,
      cacheKey,
    ),
  ).rejects.toMatchObject({ code: 'CONNECTION_LOST' });

  // Second attempt: resume with new call, should resume from offset = chunkSize
  shouldFailSecondChunk = false;
  requestedOffsets.length = 0;
  const uri = await downloadAttachment(
    request,
    'session',
    ref,
    'resumable.bin',
    new AbortController().signal,
    cacheKey,
  );

  // Offset 0 must NOT be re-requested from server! It resumed from chunkSize
  expect(requestedOffsets).toEqual([chunkSize]);
  expect(readFileSync(uri)).toEqual(bytes);
  rmSync(path.dirname(uri), { recursive: true, force: true });
});

it('discards partial file when server reports REVISION_EXPIRED', async () => {
  const chunkSize = 24_576;
  const bytes = Buffer.alloc(chunkSize * 2, 88);
  const ref = {
    contentId: 'expired-message:0',
    revision: '1',
    byteLength: String(bytes.length),
    sha256: integrity.sha256(bytes),
    mediaType: 'application/octet-stream',
  };

  let firstAttempt = true;
  const request = (async (_method: string, params: any) => {
    const start = Number(params.offset);
    if (!firstAttempt) {
      throw new RemoteAgentError('REVISION_EXPIRED');
    }
    if (start === chunkSize) {
      throw new RemoteAgentError('CONNECTION_LOST', true);
    }
    const chunk = Buffer.from(bytes.subarray(start, start + params.maxBytes));
    return {
      contentId: ref.contentId,
      revision: ref.revision,
      sha256: ref.sha256,
      offset: String(start),
      nextOffset: String(start + chunk.length),
      eof: start + chunk.length === bytes.length,
      dataBase64: chunk.toString('base64'),
    };
  }) as AgentRequest;

  const cacheKey = 'expired-test-key';
  await expect(
    downloadAttachment(
      request,
      'session',
      ref,
      'expired.bin',
      new AbortController().signal,
      cacheKey,
    ),
  ).rejects.toMatchObject({ code: 'CONNECTION_LOST' });

  firstAttempt = false;
  await expect(
    downloadAttachment(
      request,
      'session',
      ref,
      'expired.bin',
      new AbortController().signal,
      cacheKey,
    ),
  ).rejects.toMatchObject({ code: 'REVISION_EXPIRED' });

  // Partial file must be deleted upon REVISION_EXPIRED
  const dirPath = path.join(root, 'RemoteAttachments', cacheKey);
  if (existsSync(dirPath)) {
    const remaining = readdirSync(dirPath).filter((f) => f.endsWith('.part'));
    expect(remaining).toEqual([]);
    rmSync(dirPath, { recursive: true, force: true });
  }
});

it('downloads workspace file using agent.files.read and verifies bytes', async () => {
  const bytes = Buffer.from('workspace file contents');
  const file = {
    path: 'src/output.txt',
    revision: '100',
    sha256: integrity.sha256(bytes),
    byteLength: bytes.length,
    name: 'output.txt',
  };

  const requestedMethods: string[] = [];
  const request = (async (method: string, params: any) => {
    requestedMethods.push(method);
    expect(method).toBe('agent.files.read');
    expect(params.path).toBe(file.path);
    expect(params.expectedRevision).toBe(file.revision);
    return {
      path: file.path,
      revision: file.revision,
      sha256: file.sha256,
      offset: '0',
      nextOffset: String(bytes.length),
      eof: true,
      dataBase64: bytes.toString('base64'),
    };
  }) as AgentRequest;

  const uri = await downloadWorkspaceFile(
    request,
    'session',
    file,
    new AbortController().signal,
    'ws-file-key',
  );

  expect(requestedMethods).toEqual(['agent.files.read']);
  expect(readFileSync(uri)).toEqual(bytes);
  rmSync(path.dirname(uri), { recursive: true, force: true });
});

it('calculates cache size, clears cache, and protects active in-flight transfers', async () => {
  const cacheKey = 'in-flight-key';
  activeTransfers.add(cacheKey);

  // Create a directory with a file for the active transfer under root
  const activeDir = path.join(root, 'RemoteAttachments', cacheKey);
  mkdirSync(activeDir, { recursive: true });
  writeFileSync(path.join(activeDir, 'active.txt'), Buffer.alloc(100, 1));

  // Create another directory for an idle cache entry under root
  const idleDir = path.join(root, 'RemoteAttachments', 'idle-key');
  mkdirSync(idleDir, { recursive: true });
  writeFileSync(path.join(idleDir, 'idle.txt'), Buffer.alloc(200, 2));

  try {
    const size = getRemoteAttachmentCacheSize();
    expect(size).toBeGreaterThanOrEqual(300);

    // Clear cache; active in-flight transfer must NOT be deleted
    clearRemoteAttachmentCache();

    expect(existsSync(path.join(activeDir, 'active.txt'))).toBe(true);
    expect(existsSync(path.join(idleDir, 'idle.txt'))).toBe(false);
  } finally {
    activeTransfers.delete(cacheKey);
    rmSync(activeDir, { recursive: true, force: true });
    rmSync(idleDir, { recursive: true, force: true });
  }
});
