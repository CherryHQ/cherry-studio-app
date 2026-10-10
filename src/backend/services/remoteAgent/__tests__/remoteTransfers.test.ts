import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { agentUploadLimits, type AgentUploadState } from '@cherrystudio/remote-protocol/agent';

import { FileEntryIdSchema } from '@/shared/data/types/file';

import { RemoteAgentError } from '../RemoteAgentError';
import { integrity, type AgentRequest } from '../remoteContent';
import { createAttachmentDownloader, downloadAttachment } from '../remoteDownloads';
import { uploadAttachments, type SavedUpload, type RemoteUploadFiles } from '../remoteUploads';

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
          if (size > 24576) throw new Error('Unbounded native read');
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

it('resumes from the desktop committed offset after process restart and a lost write acknowledgement', async () => {
  const bytes = Buffer.alloc(agentUploadLimits.chunkBytes * 10 + 13, 71);
  const uri = path.join(root, 'source.zip');
  writeFileSync(uri, bytes);
  const files = { resolve: async () => ({ uri }) } as unknown as RemoteUploadFiles;
  let saved: SavedUpload[] = [];
  let state: AgentUploadState | undefined;
  const received: Buffer[] = [];
  let disconnected = false;
  let fail = true;
  const offsets: number[] = [];
  const request = (async (method: string, params: any) => {
    if (disconnected) throw new RemoteAgentError('CONNECTION_LOST', true);
    if (method === 'agent.uploads.get') {
      if (!state) throw new RemoteAgentError('NOT_FOUND');
      return state;
    }
    if (method === 'agent.uploads.prepare') {
      state = {
        uploadId: params.uploadId,
        state: 'receiving',
        committedOffset: '0',
        writerEpoch: '0',
        expiresAt: new Date().toISOString(),
      };
    } else if (method === 'agent.uploads.resume') {
      state = { ...state!, writerEpoch: String(Number(state!.writerEpoch) + 1) };
    } else if (method === 'agent.uploads.write') {
      expect(params.writerEpoch).toBe(state!.writerEpoch);
      expect(params.offset).toBe(state!.committedOffset);
      const chunk = Buffer.from(params.dataBase64, 'base64');
      expect(integrity.sha256(chunk)).toBe(params.chunkSha256);
      offsets.push(Number(params.offset));
      received.push(chunk);
      state = { ...state!, committedOffset: String(Number(params.offset) + chunk.length) };
      if (fail) {
        disconnected = true;
        throw new RemoteAgentError('CONNECTION_LOST', true);
      }
    } else if (method === 'agent.uploads.complete') state = { ...state!, state: 'ready' };
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
    );
  await expect(run()).rejects.toMatchObject({ code: 'CONNECTION_LOST' });
  expect(saved[0].metadata.uploadId).toBe(state!.uploadId);
  fail = false;
  disconnected = false;
  const resumed = await run();
  expect(resumed).toEqual([{ uploadId: state!.uploadId }]);
  expect(offsets.filter((offset) => offset === 0)).toHaveLength(1);
  expect(Buffer.concat(received)).toEqual(bytes);
});

it('downloads exact binary bytes in bounded windows and rejects a corrupt final digest', async () => {
  const bytes = Buffer.alloc(agentUploadLimits.chunkBytes * 9 + 5, 192);
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
