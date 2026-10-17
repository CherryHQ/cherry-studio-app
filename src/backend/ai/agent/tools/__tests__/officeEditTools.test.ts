import type { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import type { JsSandbox } from '@/backend/services/jsSandbox';
import { OFFICE_MEDIA_TYPES } from '@/backend/services/office';
import { FileEntrySchema } from '@/shared/data/types/file';
import { sha256Hex } from '@/shared/utils/sha256';

import { createOfficeEditTools } from '../officeEditTools';
import { WorkspaceFileAccess } from '../workspaceFileAccess';

const SOURCE = '00000000-0000-7000-8000-000000000001';
const OUTPUT = '00000000-0000-7000-8000-000000000002';
const WORKSPACE_ID = '00000000-0000-7000-8000-000000000003';
const bytes = new Uint8Array([80, 75, 3, 4]);
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
  const files = {
    readImage: jest.fn(),
    resolveAvailable: jest.fn(
      async () =>
        new Map([
          [
            SOURCE,
            {
              fileEntryId: SOURCE,
              name: 'source.docx',
              size: bytes.length,
              mediaType: OFFICE_MEDIA_TYPES.docx,
            },
          ],
        ]),
    ),
    readAsBytes: jest.fn(async () => bytes),
    createBytesEntry: jest.fn(async () => entry),
  };
  const sandbox: JsSandbox = {
    run: jest.fn(
      async ({ onSettled }: Parameters<JsSandbox['run']>[0]): ReturnType<JsSandbox['run']> => {
        onSettled?.();
        return {
          status: 'ok',
          result: JSON.stringify({ data: 'UEsDBA==' }),
          logs: '',
          logsTruncated: false,
          durationMs: 1,
        };
      },
    ),
  };
  const library = { contains: jest.fn(async () => false) };
  const access = new WorkspaceFileAccess(
    folderId,
    {
      fileEntryIds: new Set(allowed ? [SOURCE] : []),
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
    source_sha256: sha256Hex(bytes),
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
  return { execute, files, sandbox, library, tools };
}

test('unauthorized source references cannot read storage', async () => {
  const { execute, files } = setup(false);
  await expect(execute()).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
  expect(files.resolveAvailable).not.toHaveBeenCalled();
  expect(files.readAsBytes).not.toHaveBeenCalled();
});

test('stale inspection digests refuse computation and publication', async () => {
  const { execute, files, sandbox } = setup();
  expect((await execute({ source_sha256: 'a'.repeat(64) })).value).toMatchObject({
    status: 'error',
    message: expect.stringContaining('changed'),
  });
  expect(sandbox.run).not.toHaveBeenCalled();
  expect(files.createBytesEntry).not.toHaveBeenCalled();
});

test.each([null, WORKSPACE_ID])(
  'publishes a new derivative in destination %s',
  async (folderId) => {
    const { execute, files } = setup(true, folderId);
    const result = await execute();
    expect(files.createBytesEntry).toHaveBeenCalledWith(
      {
        data: bytes,
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
      source_sha256: sha256Hex(bytes),
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
  expect(files.readAsBytes).toHaveBeenCalledTimes(1);
  expect(sandbox.run).toHaveBeenCalledTimes(1);
  expect(files.createBytesEntry).toHaveBeenCalledTimes(1);
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
  expect(files.readAsBytes).toHaveBeenCalledTimes(1);
  expect(files.createBytesEntry).not.toHaveBeenCalled();
});

test('cancellation after native completion prevents publication', async () => {
  const { execute, files, sandbox } = setup();
  const abort = new AbortController();
  jest.mocked(sandbox.run).mockImplementationOnce(async ({ onSettled }) => {
    onSettled?.();
    abort.abort(new Error('cancelled'));
    return {
      status: 'ok',
      result: JSON.stringify({ data: 'UEsDBA==' }),
      logs: '',
      logsTruncated: false,
      durationMs: 1,
    };
  });
  await expect(execute({}, abort.signal)).rejects.toThrow('cancelled');
  expect(files.createBytesEntry).not.toHaveBeenCalled();
});
