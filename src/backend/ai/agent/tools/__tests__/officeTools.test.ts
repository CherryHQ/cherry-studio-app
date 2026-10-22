import type { FileLibraryService } from '@/backend/data/services/FileLibraryService';
import { OFFICE_MEDIA_TYPES } from '@/backend/services/office';
import { FileEntrySchema } from '@/shared/data/types/file';

import type { RuntimeTool } from '../../runtime';
import { createOfficeTools } from '../officeTools';
import { WorkspaceFileAccess } from '../workspaceFileAccess';
import { fakeOfficeFiles, fakeOfficeSandbox } from './_officeFiles';

const IMAGE_ID = '00000000-0000-7000-8000-000000000001';
const ENTRY_ID = '00000000-0000-7000-8000-000000000002';
const WORKSPACE_ID = '00000000-0000-7000-8000-000000000003';
const INPUT = {
  filename: 'Report',
  spec: { version: 1, blocks: [{ type: 'paragraph', text: 'Hello' }] },
};
const IMAGE_INPUT = {
  filename: 'Report',
  spec: {
    version: 1,
    blocks: [{ type: 'image', file_entry_id: IMAGE_ID, width_px: 10, height_px: 10 }],
  },
};
const entry = FileEntrySchema.parse({
  id: ENTRY_ID,
  filename: 'Report.docx',
  size: 4,
  mediaType: OFFICE_MEDIA_TYPES.docx,
  provenance: 'generated',
  createdAt: 1,
  updatedAt: 1,
});

function setup(folderId: string | null = null) {
  const files = fakeOfficeFiles(
    [{ fileEntryId: IMAGE_ID, name: 'image.png', mediaType: 'image/png', size: 10 }],
    entry,
  );
  const sandbox = fakeOfficeSandbox();
  const allowed = new Set<string>();
  const library = { contains: jest.fn(async () => false) };
  const access = new WorkspaceFileAccess(
    folderId,
    {
      fileEntryIds: allowed,
      availableFiles: new Map(),
      draftFileEntryIds: new Set(),
      grantFile: jest.fn(),
    },
    library as unknown as FileLibraryService,
  );
  const tools = createOfficeTools(sandbox, files, access);
  return { files, sandbox, allowed, library, tool: tools[0] };
}

function execute(
  tool: RuntimeTool,
  input: Parameters<RuntimeTool['execute']>[0]['input'] = INPUT,
  signal = new AbortController().signal,
) {
  return tool.execute({ input, signal, toolCallId: 'call', turnId: 'turn' });
}

describe('Office tools', () => {
  test.each([null, WORKSPACE_ID])(
    'publishes a generated artifact in destination %s',
    async (folderId) => {
      const { files, sandbox, tool } = setup(folderId);
      const output = await execute(tool);
      expect(sandbox.run.mock.calls[0][0].files).toEqual({
        inputs: [],
        output: 'file:///cache/1.docx',
      });
      expect(files.createFileEntry).toHaveBeenCalledWith(
        {
          uri: 'file:///cache/1.docx',
          name: 'Report.docx',
          mediaType: OFFICE_MEDIA_TYPES.docx,
          provenance: 'generated',
          folderId,
          workspaceFolderId: folderId,
        },
        expect.any(AbortSignal),
      );
      expect(output).toEqual({
        value: {
          status: 'created',
          fileEntryId: ENTRY_ID,
          filename: 'Report.docx',
          mediaType: OFFICE_MEDIA_TYPES.docx,
          size: 4,
        },
        artifacts: [
          {
            ref: { kind: 'managed-file', fileEntryId: ENTRY_ID },
            mediaType: OFFICE_MEDIA_TYPES.docx,
            name: 'Report.docx',
            kind: 'created',
          },
        ],
      });
      expect(files.discard).toHaveBeenCalledWith('file:///cache/1.docx');
    },
  );

  test('rejects every unauthorized image before reading any managed file', async () => {
    const { files, sandbox, tool } = setup();
    await expect(execute(tool, IMAGE_INPUT)).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
    expect(files.resolveAvailable).not.toHaveBeenCalled();
    expect(sandbox.run).not.toHaveBeenCalled();
  });

  test('reads workspace images and rechecks membership before each generation', async () => {
    const { files, sandbox, library, tool } = setup(WORKSPACE_ID);
    library.contains.mockResolvedValueOnce(true);
    expect((await execute(tool, IMAGE_INPUT)).value).toMatchObject({ status: 'created' });
    expect(files.prepareImage).toHaveBeenCalledTimes(1);
    expect(sandbox.run.mock.calls[0][0].files.inputs).toEqual([`file:///managed/${IMAGE_ID}`]);
    await expect(execute(tool, IMAGE_INPUT)).rejects.toMatchObject({ code: 'INVALID_OPERATION' });
    expect(files.prepareImage).toHaveBeenCalledTimes(1);
    expect(sandbox.run).toHaveBeenCalledTimes(1);
    expect(files.createFileEntry).toHaveBeenCalledTimes(1);
  });

  test('embeds a compressed copy of a large or non-PNG image and discards it', async () => {
    const { files, sandbox, allowed, tool } = setup();
    allowed.add(IMAGE_ID);
    files.prepareImage.mockResolvedValueOnce({
      uri: 'file:///cache/photo.jpg',
      mediaType: 'image/jpeg',
    });
    files.sizes.set('file:///cache/photo.jpg', 700_000);
    expect((await execute(tool, IMAGE_INPUT)).value).toMatchObject({ status: 'created' });
    const run = sandbox.run.mock.calls[0][0];
    expect(run.files.inputs).toEqual(['file:///cache/photo.jpg']);
    expect(run.code).toContain(`"${IMAGE_ID}":{"index":0,"mediaType":"image/jpeg"}`);
    expect(files.discard).toHaveBeenCalledWith('file:///cache/photo.jpg');
  });

  test('marks a failed generation as a failed call with its reason', async () => {
    const { files, sandbox, tool } = setup();
    sandbox.run.mockImplementationOnce(async ({ onSettled }) => {
      onSettled?.();
      return {
        status: 'error',
        kind: 'memory',
        message: 'The script exceeded the 128 MiB memory limit.',
        logs: '',
        logsTruncated: false,
        durationMs: 1,
      };
    });
    const output = await execute(tool);
    expect(output.failure).toMatchObject({
      scope: 'call',
      error: { message: expect.stringContaining('128 MiB memory limit') },
    });
    expect(output.value).toMatchObject({ status: 'error' });
    expect(files.createFileEntry).not.toHaveBeenCalled();
    expect(files.discard).toHaveBeenCalledWith('file:///cache/1.docx');
  });

  test('does not save when the job reports no written file', async () => {
    const { files, sandbox, tool } = setup();
    sandbox.run.mockImplementationOnce(async ({ onSettled }) => {
      onSettled?.();
      return { status: 'ok', result: 'null', logs: '', logsTruncated: false, durationMs: 1 };
    });
    expect((await execute(tool)).value).toMatchObject({ status: 'error' });
    expect(files.createFileEntry).not.toHaveBeenCalled();
  });

  test('cancellation after rendering prevents publication', async () => {
    const { files, sandbox, tool } = setup();
    const controller = new AbortController();
    const reason = new Error('cancelled');
    sandbox.run.mockImplementationOnce(async ({ onSettled }) => {
      controller.abort(reason);
      onSettled?.();
      return { status: 'ok', result: '4', logs: '', logsTruncated: false, durationMs: 1 };
    });
    await expect(execute(tool, INPUT, controller.signal)).rejects.toBe(reason);
    expect(files.createFileEntry).not.toHaveBeenCalled();
    expect(files.discard).toHaveBeenCalledWith('file:///cache/1.docx');
  });

  test('rejects oversized JSON before entering the sandbox', async () => {
    const { files, sandbox, tool } = setup();
    const output = await execute(tool, {
      ...INPUT,
      spec: {
        version: 1,
        blocks: Array.from({ length: 20 }, () => ({ type: 'paragraph', text: 'x'.repeat(16_000) })),
      },
    });
    expect(output.value).toMatchObject({ status: 'error' });
    expect(sandbox.run).not.toHaveBeenCalled();
    expect(files.createFileEntry).not.toHaveBeenCalled();
  });
});
