import type { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import type { JsSandbox } from '@/backend/services/jsSandbox';
import { OFFICE_MEDIA_TYPES } from '@/backend/services/office';
import { FileEntrySchema } from '@/shared/data/types/file';

import type { RuntimeTool } from '../../runtime';
import { createOfficeScriptTool } from '../officeScriptTool';
import { WorkspaceFileAccess } from '../workspaceFileAccess';

const INPUT_ID = '00000000-0000-7000-8000-000000000001';
const ENTRY_ID = '00000000-0000-7000-8000-000000000002';
const entry = FileEntrySchema.parse({
  id: ENTRY_ID,
  filename: 'Deck.pptx',
  size: 4,
  mediaType: OFFICE_MEDIA_TYPES.pptx,
  provenance: 'generated',
  createdAt: 1,
  updatedAt: 1,
});
type Input = Parameters<RuntimeTool['execute']>[0]['input'];

const INPUT: Input = { filename: 'Deck.pptx', code: 'return "";', inputs: [INPUT_ID] };

function setup(
  outcome: Awaited<ReturnType<JsSandbox['run']>> = {
    status: 'ok',
    result: '"UEsDBA=="',
    logs: 'slides: 3',
    logsTruncated: false,
    durationMs: 1,
  },
) {
  const files = {
    readAsBytes: jest.fn(async () => new Uint8Array([1, 2, 3])),
    createBytesEntry: jest.fn(async () => entry),
    resolveAvailable: jest.fn(
      async () =>
        new Map([
          [INPUT_ID, { fileEntryId: INPUT_ID, name: 'photo.png', mediaType: 'image/png', size: 3 }],
        ]),
    ),
    readImage: jest.fn(),
  };
  const sandbox: JsSandbox = {
    run: jest.fn(async ({ onSettled }: Parameters<JsSandbox['run']>[0]) => {
      onSettled?.();
      return outcome;
    }),
  };
  const allowed = new Set<string>();
  const access = new WorkspaceFileAccess(
    null,
    {
      fileEntryIds: allowed,
      availableFiles: new Map(),
      draftFileEntryIds: new Set(),
      grantFile: jest.fn(),
    },
    { contains: jest.fn(async () => false) } as unknown as FileLibraryService,
  );
  const tool = createOfficeScriptTool(sandbox, files, access);
  const execute = (input: Input = INPUT) =>
    tool.execute({ input, signal: new AbortController().signal, toolCallId: 'c', turnId: 't' });
  return { files, sandbox, allowed, execute };
}

describe('run_office_script', () => {
  test('gives the script authorized input bytes and publishes its result with logs', async () => {
    const { files, sandbox, allowed, execute } = setup();
    allowed.add(INPUT_ID);
    const output = await execute();
    expect(jest.mocked(sandbox.run).mock.calls[0][0].code).toContain(
      `{"${INPUT_ID}":{"name":"photo.png","mediaType":"image/png","base64":"AQID"}}`,
    );
    expect(files.createBytesEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        data: new Uint8Array([80, 75, 3, 4]),
        name: 'Deck.pptx',
        mediaType: OFFICE_MEDIA_TYPES.pptx,
        folderId: null,
      }),
      expect.any(AbortSignal),
    );
    expect(output.value).toEqual({
      status: 'created',
      fileEntryId: ENTRY_ID,
      filename: 'Deck.pptx',
      mediaType: OFFICE_MEDIA_TYPES.pptx,
      size: 4,
      logs: 'slides: 3',
    });
    expect(output.artifacts).toHaveLength(1);
  });

  test('rejects an unauthorized input before reading any file', async () => {
    const { files, sandbox, execute } = setup();
    await expect(execute()).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
    expect(files.resolveAvailable).not.toHaveBeenCalled();
    expect(sandbox.run).not.toHaveBeenCalled();
  });

  test('requires an Office filename', async () => {
    const { sandbox, execute } = setup();
    expect((await execute({ filename: 'notes.txt', code: 'return "";' })).value).toEqual({
      status: 'error',
      message: 'Use a plain filename ending in .docx, .xlsx or .pptx.',
    });
    expect(sandbox.run).not.toHaveBeenCalled();
  });

  test('reports logs without publishing when the script returns nothing', async () => {
    const { files, execute } = setup({
      status: 'ok',
      result: 'null',
      logs: 'sheets: 明细',
      logsTruncated: false,
      durationMs: 1,
    });
    expect((await execute({ filename: 'probe.xlsx', code: 'console.log("x");' })).value).toEqual({
      status: 'read',
      logs: 'sheets: 明细',
    });
    expect(files.createBytesEntry).not.toHaveBeenCalled();
  });

  test('returns the script error and console output for the model to fix', async () => {
    const { files, execute } = setup({
      status: 'error',
      kind: 'exception',
      message: 'TypeError: pres.addSlid is not a function',
      logs: 'before',
      logsTruncated: false,
      durationMs: 1,
    });
    expect((await execute({ filename: 'Deck.pptx', code: 'pres.addSlid();' })).value).toEqual({
      status: 'error',
      message:
        'Script failed (exception): TypeError: pres.addSlid is not a function\nConsole:\nbefore',
    });
    expect(files.createBytesEntry).not.toHaveBeenCalled();
  });
});
