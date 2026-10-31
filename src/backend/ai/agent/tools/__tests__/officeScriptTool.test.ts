import type { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import type { JsSandbox } from '@/backend/services/jsSandbox';
import { OFFICE_MEDIA_TYPES } from '@/backend/services/office';
import { FileEntrySchema } from '@/shared/data/types/file';

import type { RuntimeTool } from '../../runtime';
import { createOfficeScriptTool } from '../officeScriptTool';
import { WorkspaceFileAccess } from '../workspaceFileAccess';
import { fakeOfficeFiles, fakeOfficeSandbox } from './_officeFiles';

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

const DOC_ID = '00000000-0000-7000-8000-000000000003';

function setup(
  outcome: Awaited<ReturnType<JsSandbox['run']>> = {
    status: 'ok',
    result: '4',
    logs: 'slides: 3',
    logsTruncated: false,
    durationMs: 1,
  },
) {
  const files = fakeOfficeFiles(
    [
      { fileEntryId: INPUT_ID, name: 'photo.png', mediaType: 'image/png', size: 3 },
      { fileEntryId: DOC_ID, name: 'deck.pptx', mediaType: OFFICE_MEDIA_TYPES.pptx, size: 5 },
    ],
    entry,
  );
  const sandbox = fakeOfficeSandbox();
  sandbox.run.mockImplementation(async ({ onSettled }: Parameters<JsSandbox['run']>[0]) => {
    onSettled?.();
    return outcome;
  });
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
  test('gives the script authorized input files and publishes its result with logs', async () => {
    const { files, sandbox, allowed, execute } = setup();
    allowed.add(INPUT_ID);
    allowed.add(DOC_ID);
    const output = await execute({ ...INPUT, inputs: [DOC_ID, INPUT_ID] });
    const run = sandbox.run.mock.calls[0][0];
    expect(run.code).toContain(
      `{"${DOC_ID}":{"name":"deck.pptx","mediaType":"${OFFICE_MEDIA_TYPES.pptx}","size":5,"index":0},"${INPUT_ID}":{"name":"photo.png","mediaType":"image/png","size":3,"index":1}}`,
    );
    expect(run.files).toEqual({
      inputs: [`file:///managed/${DOC_ID}`, `file:///managed/${INPUT_ID}`],
      output: 'file:///cache/1.pptx',
    });
    // Only images get an embedding copy.
    expect(files.prepareImage).toHaveBeenCalledTimes(1);
    expect(files.createFileEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'file:///cache/1.pptx',
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
    expect(files.createFileEntry).not.toHaveBeenCalled();
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
    expect(files.createFileEntry).not.toHaveBeenCalled();
  });

  test('explains that a memory failure needs smaller work, not a rewrite', async () => {
    const { execute } = setup({
      status: 'error',
      kind: 'memory',
      message: 'The script exceeded the 128 MiB memory limit.',
      logs: '',
      logsTruncated: false,
      durationMs: 1,
    });
    const output = await execute({ filename: 'Deck.pptx', code: 'return 1;' });
    expect(output.failure?.error.message).toContain('Rewriting the script cannot raise this limit');
  });

  test('reports the total size when the inputs exceed one run', async () => {
    const { files, sandbox, allowed, execute } = setup();
    allowed.add(DOC_ID);
    files.sizes.set(`file:///managed/${DOC_ID}`, 97 * 1024 * 1024);
    expect((await execute({ ...INPUT, inputs: [DOC_ID] })).value).toEqual({
      status: 'error',
      message:
        'The inputs total 97.0 MiB, over the 96.0 MiB one run can read. Use fewer files per run.',
    });
    expect(sandbox.run).not.toHaveBeenCalled();
  });
});

test('script comparison adds and authorizes the original even when omitted from inputs', async () => {
  const { files, sandbox, allowed, execute } = setup();
  await expect(
    execute({ filename: 'Deck.pptx', code: 'return "";', against_file_entry_id: DOC_ID }),
  ).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
  expect(files.resolveAvailable).not.toHaveBeenCalled();
  allowed.add(DOC_ID);
  expect(
    (
      await execute({
        filename: 'Deck.pptx',
        code: 'return inputs[Object.keys(inputs)[0]].bytes;',
        against_file_entry_id: DOC_ID,
      })
    ).value,
  ).toMatchObject({ status: 'created' });
  expect(sandbox.run.mock.calls[0][0].files?.inputs).toEqual([`file:///managed/${DOC_ID}`]);
  expect(sandbox.run.mock.calls[0][0].code).toContain('const original = readInput(0).slice()');
});
