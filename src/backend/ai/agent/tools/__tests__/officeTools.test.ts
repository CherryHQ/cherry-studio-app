import type { JsSandbox } from '@/backend/services/jsSandbox';
import { OFFICE_MEDIA_TYPES } from '@/backend/services/office';
import { FileEntrySchema } from '@/shared/data/types/file';

import type { RuntimeTool } from '../../runtime';
import { createOfficeTools } from '../officeTools';

const IMAGE_ID = '00000000-0000-7000-8000-000000000001';
const ENTRY_ID = '00000000-0000-7000-8000-000000000002';
const INPUT = {
  filename: 'Report',
  spec: { version: 1, blocks: [{ type: 'paragraph', text: 'Hello' }] },
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

function setup() {
  const files = {
    readAsBytes: jest.fn(),
    createBytesEntry: jest.fn(async () => entry),
    resolveAvailable: jest.fn(
      async () =>
        new Map([
          [
            IMAGE_ID,
            { fileEntryId: IMAGE_ID, name: 'image.png', mediaType: 'image/png', size: 10 },
          ],
        ]),
    ),
    readImage: jest.fn(async () => ({ data: 'aW1hZ2U=', mediaType: 'image/png' })),
  };
  const sandbox: JsSandbox = {
    run: jest.fn(
      async ({ onSettled }: Parameters<JsSandbox['run']>[0]): ReturnType<JsSandbox['run']> => {
        onSettled?.();
        return {
          status: 'ok',
          result: '"UEsDBA=="',
          logs: '',
          logsTruncated: false,
          durationMs: 1,
        };
      },
    ),
  };
  const allowed = new Set<string>();
  const tools = createOfficeTools(sandbox, files, { fileEntryIds: allowed });
  return { files, sandbox, allowed, tool: tools[0] };
}

function execute(tool: RuntimeTool, input = INPUT, signal = new AbortController().signal) {
  return tool.execute({ input, signal, toolCallId: 'call', turnId: 'turn' });
}

describe('Office tools', () => {
  test('publishes decoded bytes as one generated artifact without leaking binary data or paths', async () => {
    const { files, tool } = setup();
    const output = await execute(tool);
    expect(files.createBytesEntry).toHaveBeenCalledWith(
      {
        data: new Uint8Array([80, 75, 3, 4]),
        name: 'Report.docx',
        mediaType: OFFICE_MEDIA_TYPES.docx,
        provenance: 'generated',
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
  });

  test('rejects every unauthorized image before reading any managed file', async () => {
    const { files, sandbox, tool } = setup();
    const output = await tool.execute({
      input: {
        filename: 'Report',
        spec: {
          version: 1,
          blocks: [{ type: 'image', file_entry_id: IMAGE_ID, width_px: 10, height_px: 10 }],
        },
      },
      signal: new AbortController().signal,
      toolCallId: 'call',
      turnId: 'turn',
    });
    expect(output.artifacts).toEqual([]);
    expect(output.value).toMatchObject({ status: 'error' });
    expect(files.resolveAvailable).not.toHaveBeenCalled();
    expect(sandbox.run).not.toHaveBeenCalled();
  });

  test('does not save a truncated sandbox result', async () => {
    const { files, sandbox, tool } = setup();
    sandbox.run = jest.fn(
      async ({ onSettled }: Parameters<JsSandbox['run']>[0]): ReturnType<JsSandbox['run']> => {
        onSettled?.();
        return {
          status: 'ok',
          result: '"UEsDBA=="',
          resultTruncated: true,
          logs: '',
          logsTruncated: false,
          durationMs: 1,
        };
      },
    );
    expect((await execute(tool)).value).toMatchObject({ status: 'error' });
    expect(files.createBytesEntry).not.toHaveBeenCalled();
  });

  test('cancellation after rendering prevents publication', async () => {
    const { files, sandbox, tool } = setup();
    const controller = new AbortController();
    const reason = new Error('cancelled');
    sandbox.run = jest.fn(
      async ({ onSettled }: Parameters<JsSandbox['run']>[0]): ReturnType<JsSandbox['run']> => {
        controller.abort(reason);
        onSettled?.();
        return {
          status: 'ok',
          result: '"UEsDBA=="',
          logs: '',
          logsTruncated: false,
          durationMs: 1,
        };
      },
    );
    await expect(execute(tool, INPUT, controller.signal)).rejects.toBe(reason);
    expect(files.createBytesEntry).not.toHaveBeenCalled();
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
    expect(files.createBytesEntry).not.toHaveBeenCalled();
  });
});
