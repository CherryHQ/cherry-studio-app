import type { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import { OFFICE_MEDIA_TYPES } from '@/backend/services/office';
import { FileEntrySchema } from '@/shared/data/types/file';

import { createOfficeEditTools } from '../officeEditTools';
import { WorkspaceFileAccess } from '../workspaceFileAccess';
import { fakeOfficeFiles, fakeOfficeSandbox } from './_officeFiles';

const SOURCE = '00000000-0000-7000-8000-000000000001';
const OUTPUT = '00000000-0000-7000-8000-000000000002';
const WORKSPACE_ID = '00000000-0000-7000-8000-000000000003';
const IMAGE = '00000000-0000-7000-8000-000000000004';
const DIGEST = 'a'.repeat(64);
const entry = FileEntrySchema.parse({
  id: OUTPUT,
  filename: 'copy.docx',
  mediaType: OFFICE_MEDIA_TYPES.docx,
  size: 4,
  provenance: 'generated',
  createdAt: 1,
  updatedAt: 1,
});

function setup(allowed = true, folderId: string | null = null) {
  const files = fakeOfficeFiles(
    [
      { fileEntryId: SOURCE, name: 'source.docx', size: 4, mediaType: OFFICE_MEDIA_TYPES.docx },
      { fileEntryId: IMAGE, name: 'photo.png', size: 10, mediaType: 'image/png' },
    ],
    entry,
  );
  const sandbox = fakeOfficeSandbox(JSON.stringify({ size: 4 }));
  const allowedIds = new Set(allowed ? [SOURCE] : []);
  const library = { contains: jest.fn(async () => false) };
  const access = new WorkspaceFileAccess(
    folderId,
    {
      fileEntryIds: allowedIds,
      availableFiles: new Map(),
      draftFileEntryIds: new Set(),
      grantFile: jest.fn(),
    },
    library as unknown as FileLibraryService,
  );
  const tools = createOfficeEditTools(sandbox, files, access);
  const tool = tools.find((tool) => tool.providerName === 'edit_document')!;
  const input = {
    version: 1,
    file_entry_id: SOURCE,
    filename: 'copy.docx',
    source_sha256: DIGEST,
    edits: [
      {
        anchor: { format: 'docx', paragraph: 0 },
        expect_text: 'hello',
        find: 'hello',
        replace: 'world',
      },
    ],
  };
  const execute = (override = {}, signal = new AbortController().signal) =>
    tool.execute({ input: { ...input, ...override }, signal, turnId: 'turn', toolCallId: 'call' });
  return { execute, files, sandbox, library, tools, allowedIds };
}

const imageEdit = {
  edits: undefined,
  images: [{ anchor: { format: 'docx', image_index: 0 }, file_entry_id: IMAGE }],
};

test('authorizes every replacement before reading the source or image bytes', async () => {
  const { execute, files, sandbox } = setup();
  await expect(execute(imageEdit)).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
  expect(files.resolveAvailable).not.toHaveBeenCalled();
  expect(files.hash).not.toHaveBeenCalled();
  expect(files.prepareImage).not.toHaveBeenCalled();
  expect(sandbox.run).not.toHaveBeenCalled();
});

test('publishes an image-only derivative and keeps the resolved media inside the compute job', async () => {
  const { execute, files, sandbox, allowedIds } = setup();
  allowedIds.add(IMAGE);
  expect((await execute(imageEdit)).value).toMatchObject({
    status: 'created',
    fileEntryId: OUTPUT,
    sha256: 'b'.repeat(64),
  });
  expect(files.prepareImage).toHaveBeenCalledTimes(1);
  const run = sandbox.run.mock.calls[0][0];
  expect(run.files).toEqual({
    inputs: [`file:///managed/${SOURCE}`, `file:///managed/${IMAGE}`],
    output: 'file:///cache/1.docx',
  });
  expect(run.code).toContain(`"${IMAGE}":{"index":1,"mediaType":"image/png"}`);
  expect(files.createFileEntry).toHaveBeenCalledTimes(1);
});

test('stale sources and unavailable replacement images never publish a derivative', async () => {
  const { execute, files, sandbox, allowedIds } = setup();
  allowedIds.add(IMAGE);
  expect((await execute({ ...imageEdit, source_sha256: '0'.repeat(64) })).value).toMatchObject({
    status: 'error',
  });
  expect(files.prepareImage).not.toHaveBeenCalled();
  // An undecodable image that is neither PNG nor JPEG cannot be embedded.
  const facts = await files.resolveAvailable();
  facts.get(IMAGE)!.mediaType = 'image/heic';
  files.resolveAvailable.mockResolvedValue(facts);
  expect((await execute(imageEdit)).value).toMatchObject({
    status: 'error',
    message: expect.stringContaining('could not be converted'),
  });
  expect(sandbox.run).not.toHaveBeenCalled();
  expect(files.createFileEntry).not.toHaveBeenCalled();
});

test('rechecks workspace replacement access on each edit', async () => {
  const { execute, files, library } = setup(false, WORKSPACE_ID);
  library.contains.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
  expect((await execute(imageEdit)).value).toMatchObject({ status: 'created' });
  library.contains.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(execute(imageEdit)).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
  expect(files.prepareImage).toHaveBeenCalledTimes(1);
  expect(files.createFileEntry).toHaveBeenCalledTimes(1);
});

test('reports the size of an oversized source before native work or publication', async () => {
  const { execute, files, sandbox } = setup();
  files.sizes.set(`file:///managed/${SOURCE}`, 65 * 1024 * 1024);
  expect((await execute()).value).toMatchObject({
    status: 'error',
    message: expect.stringContaining('65.0 MiB, over the 64.0 MiB limit'),
  });
  expect(sandbox.run).not.toHaveBeenCalled();
  expect(files.createFileEntry).not.toHaveBeenCalled();
});

test('unauthorized source references cannot read storage', async () => {
  const { execute, files } = setup(false);
  await expect(execute()).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
  expect(files.resolveAvailable).not.toHaveBeenCalled();
  expect(files.hash).not.toHaveBeenCalled();
});

test('stale inspection digests refuse computation and publication', async () => {
  const { execute, files, sandbox } = setup();
  expect((await execute({ source_sha256: '0'.repeat(64) })).value).toMatchObject({
    status: 'error',
    message: expect.stringContaining('changed'),
  });
  expect(sandbox.run).not.toHaveBeenCalled();
  expect(files.createFileEntry).not.toHaveBeenCalled();
});

test.each([null, WORKSPACE_ID])(
  'publishes a new derivative in destination %s',
  async (folderId) => {
    const { execute, files } = setup(true, folderId);
    const result = await execute();
    expect(files.createFileEntry).toHaveBeenCalledWith(
      {
        uri: 'file:///cache/1.docx',
        name: 'copy.docx',
        mediaType: OFFICE_MEDIA_TYPES.docx,
        provenance: 'generated',
        folderId,
        workspaceFolderId: folderId,
      },
      expect.any(AbortSignal),
    );
    expect(result.value).toMatchObject({
      status: 'created',
      fileEntryId: OUTPUT,
      source_file_entry_id: SOURCE,
      source_sha256: DIGEST,
    });
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        ref: { kind: 'managed-file', fileEntryId: OUTPUT },
        kind: 'derived',
      }),
    ]);
  },
);

test('edits workspace files without an attachment grant and refuses files moved outside it', async () => {
  const { execute, files, sandbox, library } = setup(false, WORKSPACE_ID);
  library.contains.mockResolvedValueOnce(true);
  expect((await execute()).value).toMatchObject({ status: 'created' });
  await expect(execute()).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
  expect(files.hash).toHaveBeenCalledTimes(2);
  expect(sandbox.run).toHaveBeenCalledTimes(1);
  expect(files.createFileEntry).toHaveBeenCalledTimes(1);
});

test.each([
  ['inspect_office_file', {}],
  ['read_office_content', { anchor: { format: 'docx', paragraph: 0 } }],
] as const)('%s uses workspace read authorization', async (name, input) => {
  const { tools, files, sandbox, library } = setup(false, WORKSPACE_ID);
  library.contains.mockResolvedValueOnce(true);
  jest.mocked(sandbox.run).mockImplementation(async ({ onSettled }) => {
    onSettled?.();
    return {
      status: 'ok',
      result: JSON.stringify(name === 'inspect_office_file' ? { items: [] } : { text: 'hello' }),
      logs: '',
      logsTruncated: false,
      durationMs: 1,
    };
  });
  const call = {
    input: { file_entry_id: SOURCE, ...input },
    signal: new AbortController().signal,
    turnId: 'turn',
    toolCallId: 'call',
  };
  const tool = tools.find((tool) => tool.providerName === name)!;
  expect((await tool.execute(call)).value).toMatchObject({ status: 'read' });
  await expect(tool.execute(call)).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
  expect(sandbox.run.mock.calls[0][0].files).toEqual({
    inputs: [`file:///managed/${SOURCE}`],
    output: undefined,
  });
  expect(files.createFileEntry).not.toHaveBeenCalled();
});

test('cancellation after native completion prevents publication', async () => {
  const { execute, files, sandbox } = setup();
  const abort = new AbortController();
  jest.mocked(sandbox.run).mockImplementationOnce(async ({ onSettled }) => {
    onSettled?.();
    abort.abort(new Error('cancelled'));
    return {
      status: 'ok',
      result: JSON.stringify({ size: 4 }),
      logs: '',
      logsTruncated: false,
      durationMs: 1,
    };
  });
  await expect(execute({}, abort.signal)).rejects.toThrow('cancelled');
  expect(files.createFileEntry).not.toHaveBeenCalled();
  expect(files.discard).toHaveBeenCalledWith('file:///cache/1.docx');
});

test('comparison is independently authorized before reading either package', async () => {
  const { tools, files, sandbox } = setup();
  const tool = tools.find((tool) => tool.providerName === 'inspect_office_file')!;
  await expect(
    tool.execute({
      input: { file_entry_id: SOURCE, kind: 'check', against_file_entry_id: IMAGE },
      signal: new AbortController().signal,
      turnId: 'turn',
      toolCallId: 'check',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
  expect(files.resolveAvailable).not.toHaveBeenCalled();
  expect(sandbox.run).not.toHaveBeenCalled();
});

test('check passes the untouched comparison snapshot to the package checker and preserves finding totals', async () => {
  const { tools, sandbox } = setup();
  sandbox.run.mockImplementationOnce(async ({ onSettled }) => {
    onSettled?.();
    return {
      status: 'ok',
      result: JSON.stringify({
        kind: 'check',
        errors: 3,
        warnings: 0,
        existing: 1,
        compared: true,
        total: 3,
        offset: 2,
        findings: [],
      }),
      logs: '',
      logsTruncated: false,
      durationMs: 1,
    };
  });
  const result = await tools
    .find((tool) => tool.providerName === 'inspect_office_file')!
    .execute({
      input: {
        file_entry_id: SOURCE,
        kind: 'check',
        against_file_entry_id: SOURCE,
        offset: 2,
        limit: 1,
      },
      signal: new AbortController().signal,
      turnId: 'turn',
      toolCallId: 'check',
    });
  expect(result.value).toMatchObject({
    status: 'read',
    kind: 'check',
    compared: true,
    errors: 3,
    total: 3,
    against_file_entry_id: SOURCE,
  });
  expect(sandbox.run.mock.calls[0][0].files?.inputs).toEqual([
    `file:///managed/${SOURCE}`,
    `file:///managed/${SOURCE}`,
  ]);
});
