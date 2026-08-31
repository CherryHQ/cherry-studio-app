import { FileEntrySchema, type FileEntryId } from '@/shared/data/types/file';

import type { ManagedFileFact } from '../../resources/managedFileResolver';
import type { RuntimeJsonValue, RuntimeToolResult } from '../../runtime';
import {
  createEditFileTool,
  EDIT_FILE_MAX_CONTENT_BYTES,
  type EditFileFiles,
} from '../editFileTool';

const SOURCE_ID = '00000000-0000-7000-8000-000000000001' as FileEntryId;
const EDITED_ID = '00000000-0000-7000-8000-000000000002' as FileEntryId;

describe('editFileTool', () => {
  test('creates a derived copy after one exact replacement', async () => {
    const files = createFiles('Hello world\n');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'world',
      new_string: 'Cherry',
    });

    expect(files.createTextEntry).toHaveBeenCalledWith({
      data: 'Hello Cherry\n',
      mediaType: 'text/markdown',
      name: 'notes.md',
      provenance: 'generated',
    });
    expect(output).toEqual({
      value: {
        status: 'edited',
        sourceFileEntryId: SOURCE_ID,
        fileEntryId: EDITED_ID,
        filename: 'notes.md',
        size: 13,
        replacements: 1,
      },
      artifacts: [
        {
          ref: { kind: 'managed-file', fileEntryId: EDITED_ID },
          mediaType: 'text/markdown',
          name: 'notes.md',
          kind: 'derived',
        },
      ],
    });
  });

  test('exposes stable identity and automatic approval', () => {
    expect(createEditFileTool(createFiles('text'))).toMatchObject({
      ref: { source: 'builtin', capabilityId: 'edit_file' },
      providerName: 'edit_file',
      displayName: 'Edit file',
      approval: 'auto',
    });
  });

  test('replaces all non-overlapping exact matches', async () => {
    const files = createFiles('aaaa');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'aa',
      new_string: 'b',
      replace_all: true,
    });

    expect(files.createTextEntry).toHaveBeenCalledWith(expect.objectContaining({ data: 'bb' }));
    expect(output.value).toMatchObject({ status: 'edited', replacements: 2 });
  });

  test('allows deleting the unique match with an empty replacement', async () => {
    const files = createFiles('keep remove keep');
    await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: ' remove',
      new_string: '',
    });

    expect(files.createTextEntry).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'keep keep' }),
    );
  });

  test('matches case-sensitively', async () => {
    const files = createFiles('Cherry');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'cherry',
      new_string: 'Berry',
    });

    expectError(output, 'not found');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('rejects a repeated single replacement without creating a file', async () => {
    const files = createFiles('same same');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'same',
      new_string: 'new',
    });

    expectError(output, 'multiple');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test.each([
    ['an empty old string', { old_string: '', new_string: 'x' }, 'Invalid input'],
    ['equal strings', { old_string: 'x', new_string: 'x' }, 'must be different'],
    [
      'an invalid id',
      { file_entry_id: 'not-an-id', old_string: 'x', new_string: 'y' },
      'Invalid input',
    ],
  ])('rejects %s', async (_case, overrides, message) => {
    const files = createFiles('x');
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      ...overrides,
    });

    expectError(output, message);
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('rejects unavailable managed entries', async () => {
    const files = createFiles('x');
    files.resolveAvailable.mockResolvedValueOnce(new Map());
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'x',
      new_string: 'y',
    });

    expectError(output, 'unavailable');
    expect(files.readAsBytes).not.toHaveBeenCalled();
  });

  test.each([
    ['invalid UTF-8', Uint8Array.from([0xc0, 0xaf]), 'valid UTF-8'],
    ['a NUL byte', Uint8Array.from([65, 0, 66]), 'NUL'],
    ['a binary control', Uint8Array.from([65, 1, 66]), 'control'],
  ])('rejects %s content', async (_case, bytes, message) => {
    const files = createFiles(bytes);
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'A',
      new_string: 'B',
    });

    expectError(output, message);
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('enforces declared and actual source byte limits', async () => {
    const declared = createFiles('x', EDIT_FILE_MAX_CONTENT_BYTES + 1);
    expectError(
      await execute(createEditFileTool(declared), {
        file_entry_id: SOURCE_ID,
        old_string: 'x',
        new_string: 'y',
      }),
      'limit',
    );
    expect(declared.readAsBytes).not.toHaveBeenCalled();

    const actual = createFiles(new Uint8Array(EDIT_FILE_MAX_CONTENT_BYTES + 1), 1);
    expectError(
      await execute(createEditFileTool(actual), {
        file_entry_id: SOURCE_ID,
        old_string: 'x',
        new_string: 'y',
      }),
      'limit',
    );
  });

  test('rejects a result over the byte limit', async () => {
    const files = createFiles('a'.repeat(EDIT_FILE_MAX_CONTENT_BYTES));
    const output = await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'a',
      new_string: 'aa',
      replace_all: true,
    });

    expectError(output, 'edited file exceeds');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('preserves a UTF-8 BOM and existing newlines', async () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('a\r\nb\r\n')]);
    const files = createFiles(bytes);
    await execute(createEditFileTool(files), {
      file_entry_id: SOURCE_ID,
      old_string: 'b',
      new_string: 'c',
    });

    expect(files.createTextEntry).toHaveBeenCalledWith(
      expect.objectContaining({ data: '\ufeffa\r\nc\r\n' }),
    );
  });

  test('does not create a copy when cancellation follows the read', async () => {
    const files = createFiles('old');
    const controller = new AbortController();
    files.readAsBytes.mockImplementationOnce(async () => {
      controller.abort(new Error('turn cancelled'));
      return new TextEncoder().encode('old');
    });

    await expect(
      createEditFileTool(files).execute({
        input: {
          file_entry_id: SOURCE_ID,
          old_string: 'old',
          new_string: 'new',
          replace_all: false,
        },
        signal: controller.signal,
        toolCallId: 'call-1',
      }),
    ).rejects.toThrow('turn cancelled');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('lets storage failures surface as execution errors', async () => {
    const files = createFiles('old');
    files.createTextEntry.mockRejectedValueOnce(new Error('disk full'));

    await expect(
      execute(createEditFileTool(files), {
        file_entry_id: SOURCE_ID,
        old_string: 'old',
        new_string: 'new',
      }),
    ).rejects.toThrow('disk full');
  });

  test('exposes a strict portable schema with optional replace_all and no UUID format', () => {
    const schema = createEditFileTool(createFiles('x')).inputSchema;
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        file_entry_id: expect.objectContaining({ type: 'string' }),
        old_string: expect.objectContaining({ type: 'string' }),
        new_string: expect.objectContaining({ type: 'string' }),
        replace_all: expect.objectContaining({ type: 'boolean' }),
      },
      required: ['file_entry_id', 'old_string', 'new_string'],
      additionalProperties: false,
    });
    expect(schema).not.toMatchObject({
      properties: { file_entry_id: { format: expect.anything() } },
    });
  });
});

function createFiles(content: string | Uint8Array, declaredSize?: number) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const source: ManagedFileFact = {
    fileEntryId: SOURCE_ID,
    mediaType: 'text/markdown',
    name: 'notes.md',
    size: declaredSize ?? bytes.byteLength,
  };
  const resolveAvailable = jest.fn(async () => new Map([[SOURCE_ID, source]]));
  const readAsBytes = jest.fn(async () => bytes);
  const createTextEntry = jest.fn(async (input: Parameters<EditFileFiles['createTextEntry']>[0]) =>
    FileEntrySchema.parse({
      createdAt: 2,
      filename: input.name,
      id: EDITED_ID,
      mediaType: input.mediaType,
      provenance: input.provenance,
      size: new TextEncoder().encode(input.data).byteLength,
      updatedAt: 2,
    }),
  );
  return { createTextEntry, readAsBytes, resolveAvailable } satisfies EditFileFiles & {
    createTextEntry: jest.Mock;
    readAsBytes: jest.Mock;
    resolveAvailable: jest.Mock;
  };
}

function execute(
  tool: ReturnType<typeof createEditFileTool>,
  input: RuntimeJsonValue,
): Promise<RuntimeToolResult> {
  return tool.execute({ input, signal: new AbortController().signal, toolCallId: 'call-1' });
}

function expectError(output: RuntimeToolResult, message: string) {
  expect(output).toEqual({
    value: { status: 'error', message: expect.stringContaining(message) },
    artifacts: [],
  });
}
