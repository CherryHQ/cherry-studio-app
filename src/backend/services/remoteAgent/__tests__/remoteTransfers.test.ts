import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type AgentUploadState } from '@cherrystudio/remote-protocol/agent';

import { RemoteAgentCommandJournal } from '@/backend/data/services/RemoteAgentCommandJournal';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { RemoteAgentError } from '../RemoteAgentError';
import { RemoteAttachmentDrafts } from '../RemoteAttachmentDrafts';
import { integrity, type AgentRequest } from '../remoteContent';
import { createAttachmentDownloader, downloadAttachment } from '../remoteDownloads';
import { uploadAttachments, type SavedUpload, type RemoteUploadFiles } from '../remoteUploads';

const mockNativeReads: number[] = [];

jest.mock('expo-file-system', () => {
  const fs = jest.requireActual<typeof import('node:fs')>('node:fs');
  const path = jest.requireActual<typeof import('node:path')>('node:path');
  const root = jest.requireActual<typeof import('node:os')>('node:os').tmpdir();
  const location = (parts: any[]) =>
    path.join(...parts.map((part) => (typeof part === 'string' ? part : part.uri)));
  class Directory {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = location(parts);
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
  }
  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = location(parts);
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
        readBytes(size: number) {
          mockNativeReads.push(size);
          if (size > 1024 * 1024) throw new Error('Unbounded native read');
          const bytes = Buffer.alloc(size);
          const count = fs.readSync(fd, bytes, 0, size, this.offset);
          this.offset += count;
          return bytes.subarray(0, count);
        },
        writeBytes(bytes: Uint8Array) {
          this.offset += fs.writeSync(fd, bytes, 0, bytes.length, this.offset);
        },
        close() {
          fs.closeSync(fd);
        },
      };
    }
  }
  return { File, Directory, Paths: { cache: root } };
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'mobile-transfer-'));
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

it('closing one consumer does not cancel a shared download, while closing all removes partial bytes', async () => {
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
  expect(existsSync(path.dirname(uri)) ? readdirSync(path.dirname(uri)) : []).toEqual([]);
  rmSync(path.dirname(uri), { recursive: true, force: true });
});

it.each([false, true])(
  'uploads selected bytes before send and recovers with reordered response fields: %s',
  async (reorder) => {
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
    const request = (async (method: string, params: any) => {
      if (method === 'agent.attachmentDrafts.open') {
        draft = {
          ...params,
          items: params.items.map((item: object) =>
            reorder ? Object.fromEntries(Object.entries(item).toReversed()) : item,
          ),
          state: 'open',
          manifestRevision: '0',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        };
        return draft;
      }
      if (method === 'agent.attachmentDrafts.get')
        return { ...draft, items: draft.items.map((item: any) => ({ ...item, upload })) };
      if (method === 'agent.uploads.get') {
        if (!upload) throw new RemoteAgentError('NOT_FOUND');
        return upload;
      }
      if (method === 'agent.uploads.prepare') {
        expect(draft.items[0].uploadId).toBe(params.uploadId);
        expect(params.draftId).toBe(draft.draftId);
        upload = {
          uploadId: params.uploadId,
          state: 'receiving',
          committedOffset: '0',
          writerEpoch: '0',
          expiresAt: draft.expiresAt,
        };
      } else if (method === 'agent.uploads.resume') upload = { ...upload!, writerEpoch: '1' };
      else if (method === 'agent.uploads.complete') upload = { ...upload!, state: 'ready' };
      else throw new Error(`Selection must not send a message: ${method}`);
      return upload;
    }) as AgentRequest;
    const transport = async () => ({
      write: async (input: any) => {
        received.push(Buffer.from(input.bytes));
        upload = { ...upload!, committedOffset: String(Buffer.concat(received).length) };
        return { ok: true as const, requestId: 'ack', ...upload };
      },
    });
    const files = {
      resolve: async () => ({ uri, entry: { id: attachment.fileEntryId } }),
      prepareUploadSource: async () => ({ uri, entry: { id: attachment.fileEntryId } }),
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
    tasks.reconcile(new Set([ready.attachmentDraft.draftId]));
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
      case 'agent.attachmentDrafts.open':
        draft = {
          ...params,
          state: 'open',
          manifestRevision: '0',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        };
        return draft;
      case 'agent.attachmentDrafts.get':
        return draft;
      case 'agent.attachmentDrafts.update':
        draft = { ...draft, items: params.items, manifestRevision: '1' };
        return draft;
      case 'agent.attachmentDrafts.cancel':
        draft = { ...draft, state: 'cancelled', manifestRevision: '2' };
        return draft;
      case 'agent.uploads.get':
        throw new RemoteAgentError('NOT_FOUND');
      case 'agent.uploads.prepare':
        upload = {
          uploadId: params.uploadId,
          state: 'receiving',
          committedOffset: '0',
          writerEpoch: '0',
          expiresAt: draft.expiresAt,
        };
        return upload;
      case 'agent.uploads.resume':
        return { ...upload, writerEpoch: '1' };
      default:
        throw new Error(`Removed attachment must not complete or send: ${method}`);
    }
  }) as AgentRequest;
  const transport = async () => ({
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
    resolve: async () => ({ uri, entry: { id: attachment.fileEntryId } }),
    prepareUploadSource: async () => ({ uri, entry: { id: attachment.fileEntryId } }),
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
  expect(draft.state).toBe('cancelled');
  expect(draft.items).toEqual([]);
  expect(tasks.get()).toEqual([]);
  tasks.stop();
});

it('uploads MiB binary blocks without a pre-scan and resumes the persisted snapshot after a lost ACK', async () => {
  mockNativeReads.length = 0;
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 19, 63);
  const uri = path.join(root, 'snapshot.bin');
  writeFileSync(uri, bytes);
  const snapshotId = '12345678-1234-4234-8234-123456789def';
  const files = {
    prepareUploadSource: jest.fn(async () => ({ uri, entry: { id: snapshotId } })),
    resolve: async (id: string) => {
      if (id !== snapshotId) throw new Error('Original source must not be reopened');
      return { uri, entry: { id: snapshotId } };
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
      expect(mockNativeReads).toEqual([]);
      state = {
        uploadId: input.uploadId,
        state: 'receiving',
        committedOffset: '0',
        writerEpoch: '0',
        expiresAt: new Date().toISOString(),
      };
    } else if (method === 'agent.uploads.resume') {
      state = { ...state!, writerEpoch: String(Number(state!.writerEpoch) + 1) };
    } else if (method === 'agent.uploads.complete') state = { ...state!, state: 'ready' };
    else throw new Error('Unexpected upload request: ' + method);
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
        write: async (input) => {
          expect(Number(input.offset)).toBe(Number(state!.committedOffset));
          expect(input.bytes.length).toBeLessThanOrEqual(1024 * 1024);
          received.push(input.bytes);
          state = { ...state!, committedOffset: String(Number(input.offset) + input.bytes.length) };
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
      { draftId: 'draft', attachmentId: 'attachment', uploadId: 'upload' },
    );
  await expect(run()).rejects.toMatchObject({ code: 'CONNECTION_LOST' });
  expect(saved[0].sourceFileEntryId).toBe(snapshotId);
  expect(state!.committedOffset).toBe(String(2 * 1024 * 1024));
  disconnect = false;
  await expect(run()).resolves.toEqual([{ uploadId: 'upload' }]);
  expect(Buffer.concat(received).equals(bytes)).toBe(true);
  expect(received.map((chunk) => chunk.length)).toEqual([1048576, 1048576, 19]);
  expect(files.prepareUploadSource).toHaveBeenCalledTimes(1);
});
