import type { JsSandbox } from '@/backend/services/jsSandbox';
import { OFFICE_MEDIA_TYPES } from '@/backend/services/office';
import { FileEntrySchema } from '@/shared/data/types/file';
import { sha256Hex } from '@/shared/utils/sha256';

import { createOfficeEditTools } from '../officeEditTools';

const SOURCE = '00000000-0000-7000-8000-000000000001';
const OUTPUT = '00000000-0000-7000-8000-000000000002';
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

function setup(allowed = true) {
  const files = {
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
  const tools = createOfficeEditTools(sandbox, files, {
    fileEntryIds: new Set(allowed ? [SOURCE] : []),
  });
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
  return { execute, files, sandbox };
}

test('unauthorized source references cannot read storage', async () => {
  const { execute, files } = setup(false);
  expect((await execute()).value).toMatchObject({ status: 'error' });
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

test('publishes only a new managed derivative with source provenance in the receipt', async () => {
  const { execute, files } = setup();
  const result = await execute();
  expect(files.createBytesEntry).toHaveBeenCalledWith(
    { data: bytes, name: 'copy.docx', mediaType: OFFICE_MEDIA_TYPES.docx, provenance: 'generated' },
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
