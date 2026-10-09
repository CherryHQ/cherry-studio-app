import type { createWecomApi } from '../wecomApi';
import {
  deleteWecomFiles,
  prepareWecomFiles,
  saveWecomResult,
  sweepWecomFiles,
} from '../wecomFiles';
import { resolveWecomSchema } from '../wecomSchema';

const mockGetFileUri = jest.fn();
let mockStorageUri = 'file:///documents/';
jest.mock('@/backend/data/storage/storagePaths', () => ({
  storageDirectory: () => ({ uri: mockStorageUri }),
}));
jest.mock('@/backend/data/services/FileEntryService', () => ({ fileEntryService: {} }));
jest.mock('@/backend/services/file/fileStorage', () => ({
  getFileUri: (...args: unknown[]) => mockGetFileUri(...args),
}));
jest.mock('@/backend/services/http', () => ({ createHttpClient: () => ({}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'unique-id' }));
jest.mock('expo-file-system', () => {
  const files = new Map<string, number>();
  const modified = new Map<string, number>();
  const writes: { uri: string; data: unknown; options?: unknown }[] = [];
  const join = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/$/, '')).join('/');
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = `${join(parts)}/`;
    }
    create() {}
    get exists() {
      return [...files.keys()].some((uri) => uri.startsWith(this.uri));
    }
    list() {
      return [...files.keys()]
        .filter((uri) => uri.startsWith(this.uri))
        .map((uri) => new File(uri));
    }
    delete() {
      for (const uri of files.keys()) if (uri.startsWith(this.uri)) files.delete(uri);
    }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').at(-1);
    }
    get size() {
      return files.get(this.uri) ?? 0;
    }
    get exists() {
      return files.has(this.uri);
    }
    get modificationTime() {
      return modified.get(this.uri) ?? null;
    }
    write(data: string | Uint8Array, options?: unknown) {
      if (data === 'unwritable') throw new Error('disk full');
      writes.push({ uri: this.uri, data, options });
      files.set(this.uri, typeof data === 'string' ? data.length : data.byteLength);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  return {
    File,
    Directory,
    Paths: { cache: { uri: 'file:///cache/' }, document: { uri: 'file:///documents/' } },
    testState: { files, modified, writes },
  };
});

const { testState } = jest.requireMock<{
  testState: {
    files: Map<string, number>;
    modified: Map<string, number>;
    writes: { uri: string; data: unknown; options?: unknown }[];
  };
}>('expo-file-system');
const uri = 'file:///documents/Data/Files/report.pdf';
const signal = () => new AbortController().signal;
const call = jest.fn();
const api = { call } as unknown as ReturnType<typeof createWecomApi>;
const upload = { type: 'string', 'x-wecom-file-upload': true };
const octet = { type: 'string', 'x-wecom-octet-stream': true };
beforeEach(() => {
  mockStorageUri = 'file:///documents/';
  testState.files.clear();
  testState.modified.clear();
  testState.files.set(uri, 123);
  testState.writes.length = 0;
  mockGetFileUri.mockReset().mockResolvedValue(uri);
  call.mockReset().mockResolvedValue({ kind: 'json', value: { result: '{"media_id":"media-1"}' } });
});

it('permits restored attachments only from the selected storage generation', async () => {
  mockStorageUri = 'file:///documents/stores/10000000-0000-4000-8000-000000000001/';
  const restored = `${mockStorageUri}Data/Files/report.pdf`;
  testState.files.set(restored, 123);
  const schema = { type: 'object', properties: { file: upload } };
  await expect(prepareWecomFiles(api, schema, { file: restored }, signal())).resolves.toMatchObject(
    { payload: { file: 'media-1' } },
  );
  call.mockClear();
  await expect(prepareWecomFiles(api, schema, { file: uri }, signal())).rejects.toThrow(
    'Only Cherry attachments',
  );
  expect(call).not.toHaveBeenCalled();
});

it('resolves the attachment ID shown to the model into its current native file', async () => {
  const id = '00000000-0000-7000-8000-000000000001';
  const prepared = await prepareWecomFiles(
    api,
    {
      type: 'object',
      properties: { file: upload },
    },
    { file: id },
    signal(),
  );
  expect(mockGetFileUri).toHaveBeenCalledWith(expect.anything(), id);
  expect(prepared.payload).toEqual({ file: 'media-1' });
  mockGetFileUri.mockResolvedValueOnce(undefined);
  await expect(
    prepareWecomFiles(
      api,
      {
        type: 'object',
        properties: { file: upload },
      },
      { file: id },
      signal(),
    ),
  ).rejects.toMatchObject({ reason: 'request' });
  expect(call).toHaveBeenCalledTimes(1);
});
afterEach(() => jest.restoreAllMocks());

it('uploads a repeated attachment once, replaces nested fields and preserves caller arguments', async () => {
  const args = { files: [uri], attachment: uri };
  const prepared = await prepareWecomFiles(
    api,
    {
      type: 'object',
      properties: {
        files: { type: 'array', items: upload },
        attachment: { type: 'string', 'x-wecom-file-upload': { withFilePath: true } },
      },
    },
    args,
    signal(),
  );
  expect(prepared.payload).toEqual({
    files: ['media-1'],
    attachment: { media_id: 'media-1', file_path: uri },
  });
  expect(args).toEqual({ files: [uri], attachment: uri });
  expect(call).toHaveBeenCalledTimes(1);
  const append = jest.spyOn(FormData.prototype, 'append').mockImplementation(() => {});
  const request = call.mock.calls[0][0];
  request.form();
  expect(request).toMatchObject({ endpoint: { path: '/cli/file/upload' }, effect: 'write' });
  expect(append.mock.calls).toEqual([
    ['media', expect.objectContaining({ uri }), 'report.pdf'],
    ['type', 'file'],
  ]);
});

it.each([
  'file:///documents/SQLite/private.db',
  'file:///documents/Data/Files/../../SQLite/private.db',
  'file:///documents/Data/Files/sub%2f..%2f..%2f..%2fprivate.db',
  'https://attacker.test/private.pdf',
  'file:///documents/Data/Files/missing.pdf',
])('validates all files before any upload, rejecting %s', async (other) => {
  await expect(
    prepareWecomFiles(
      api,
      {
        type: 'object',
        properties: { files: { type: 'array', items: upload } },
      },
      { files: [uri, other] },
      signal(),
    ),
  ).rejects.toHaveProperty('reason');
  expect(call).not.toHaveBeenCalled();
});

it('bounds the whole multipart body even when each repeated file fits individually', async () => {
  testState.files.set(uri, 60 * 1024 * 1024);
  await expect(
    prepareWecomFiles(
      api,
      {
        type: 'object',
        properties: { files: { type: 'array', items: octet } },
      },
      { files: [uri, uri] },
      signal(),
    ),
  ).rejects.toMatchObject({ reason: 'request' });
  expect(call).not.toHaveBeenCalled();
});

it('flattens native multipart fields and keeps multipart encoding when an optional file is absent', async () => {
  const schema = {
    type: 'object',
    properties: { attachments: { type: 'array', items: octet } },
  };
  const append = jest.spyOn(FormData.prototype, 'append').mockImplementation(() => {});
  const prepared = await prepareWecomFiles(
    api,
    schema,
    {
      attachments: [uri],
      metadata: { title: 'Report', enabled: true },
    },
    signal(),
  );
  prepared.form!();
  expect(append.mock.calls).toEqual([
    ['attachments[0]', expect.objectContaining({ uri }), 'report.pdf'],
    ['metadata.title', 'Report'],
    ['metadata.enabled', 'true'],
  ]);
  expect(call).not.toHaveBeenCalled();
  const empty = await prepareWecomFiles(api, schema, {}, signal());
  expect(empty.form).toBeDefined();
});

it('saves nested file results locally and honors returned encoding and filename without traversal', () => {
  const output = saveWecomResult(
    {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            'x-wecom-file-save': { fileName: 'default.txt' },
          },
        },
      },
    },
    { files: [{ content: 'AAH/', file_name: '../../report.bin', content_encoding: 'base64' }] },
    signal(),
  );
  expect(output).toEqual({ files: ['file:///cache/WecomFiles/unique-id-report.bin'] });
  expect(testState.writes).toEqual([
    {
      uri: 'file:///cache/WecomFiles/unique-id-report.bin',
      data: 'AAH/',
      options: { encoding: 'base64' },
    },
  ]);
});

it('preserves an oversized JSON result in a local file instead of truncating it', () => {
  const value = { text: 'x'.repeat(121 * 1024) };
  expect(saveWecomResult(undefined, value, signal())).toMatchObject({
    file_path: 'file:///cache/WecomFiles/unique-id-result.json',
  });
  expect(JSON.parse(testState.writes[0].data as string)).toEqual(value);
});

it('removes files already saved for a result that fails to save completely', () => {
  const schema = {
    type: 'object',
    properties: {
      first: { type: 'string', 'x-wecom-file-save': { fileName: 'first.txt' } },
      second: { type: 'string', 'x-wecom-file-save': { fileName: 'second.txt' } },
    },
  };
  expect(() => saveWecomResult(schema, { first: 'saved', second: 'unwritable' }, signal())).toThrow(
    expect.objectContaining({ reason: 'request' }),
  );
  expect(testState.writes.map(({ uri }) => uri)).toEqual([
    'file:///cache/WecomFiles/unique-id-first.txt',
  ]);
  expect([...testState.files.keys()]).toEqual([uri]);
});

it('sweeps expired downloads and removes every download on disconnect', () => {
  const day = 24 * 60 * 60 * 1000;
  const expired = 'file:///cache/WecomFiles/old-report.bin';
  const recent = 'file:///cache/WecomFiles/new-report.bin';
  testState.files.set(expired, 1);
  testState.modified.set(expired, 1000);
  testState.files.set(recent, 1);
  testState.modified.set(recent, 2000);

  sweepWecomFiles(1001 + day);

  expect([...testState.files.keys()]).toEqual([uri, recent]);
  deleteWecomFiles();
  expect([...testState.files.keys()]).toEqual([uri]);
});

function recursiveFiles(directive: Record<string, unknown>) {
  return resolveWecomSchema(
    { $ref: 'Node' },
    {
      Node: {
        type: 'object',
        properties: {
          children: { type: 'array', items: { type: 'object', $ref: 'Node' } },
          files: { type: 'object', additionalProperties: { $ref: 'File' } },
        },
      },
      File: { type: 'string', ...directive },
    },
  );
}

it('uploads files inside recursive children and dictionaries without changing caller arguments', async () => {
  const args = { children: [{ children: [{ files: { report: uri } }] }] };
  const prepared = await prepareWecomFiles(api, recursiveFiles(upload), args, signal());
  expect(prepared.payload).toEqual({
    children: [{ children: [{ files: { report: 'media-1' } }] }],
  });
  expect(args.children[0].children[0].files.report).toBe(uri);
  expect(call).toHaveBeenCalledTimes(1);
});

it('uses multipart for recursive file fields even when the optional files are absent', async () => {
  const schema = recursiveFiles(octet);
  const append = jest.spyOn(FormData.prototype, 'append').mockImplementation(() => {});
  const prepared = await prepareWecomFiles(
    api,
    schema,
    { children: [{ files: { report: uri } }] },
    signal(),
  );
  prepared.form!();
  expect(append.mock.calls).toEqual([
    ['children[0].files.report', expect.objectContaining({ uri }), 'report.pdf'],
  ]);
  expect(call).not.toHaveBeenCalled();
  expect((await prepareWecomFiles(api, schema, { children: [{}] }, signal())).form).toBeDefined();
});

it('saves file results in recursive response nodes', () => {
  const output = saveWecomResult(
    recursiveFiles({ 'x-wecom-file-save': { fileName: 'nested.txt' } }),
    { children: [{ children: [{ files: { content: 'Nested text' } }] }] },
    signal(),
  );
  expect(output).toEqual({
    children: [
      { children: [{ files: { content: 'file:///cache/WecomFiles/unique-id-nested.txt' } }] },
    ],
  });
  expect(testState.writes[0].data).toBe('Nested text');
});
