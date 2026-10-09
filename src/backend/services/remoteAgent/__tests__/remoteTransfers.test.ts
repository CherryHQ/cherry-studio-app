import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { agentUploadLimits, type AgentUploadState } from '@cherrystudio/remote-protocol/agent';

import { FileEntryIdSchema } from '@/shared/data/types/file';

import { RemoteAgentError } from '../RemoteAgentError';
import { integrity, type AgentRequest } from '../remoteContent';
import { downloadAttachment } from '../remoteDownloads';
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
