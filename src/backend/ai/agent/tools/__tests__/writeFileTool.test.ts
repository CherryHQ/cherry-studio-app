import { type FileEntryProvenance, FileEntrySchema } from '@/shared/data/types/file';

import type { RuntimeJsonValue, RuntimeToolResult } from '../../runtime';
import {
  createWriteFileTool,
  WRITE_FILE_MAX_CONTENT_BYTES,
  type WriteFileFiles,
} from '../writeFileTool';

describe('writeFileTool', () => {
  test('writes text and reports the stored entry', async () => {
    const files = createFilesPort();
    const tool = createWriteFileTool(files);

    const output = await execute(tool, { content: '# Report\n', filename: 'report.md' });

    expect(files.createTextEntry).toHaveBeenCalledWith({
      data: '# Report\n',
      mediaType: 'text/markdown',
      name: 'report.md',
      provenance: 'generated',
    });
    expect(output).toEqual({
      value: {
        status: 'created',
        fileEntryId: '00000000-0000-7000-8000-000000000001',
        filename: 'report.md',
        size: 9,
      },
      artifacts: [
        {
          ref: {
            kind: 'managed-file',
            fileEntryId: '00000000-0000-7000-8000-000000000001',
          },
          mediaType: 'text/markdown',
          name: 'report.md',
          kind: 'created',
        },
      ],
    });
  });

  test('exposes stable Runtime identity for the existing provider function', () => {
    const tool = createWriteFileTool(createFilesPort());

    expect(tool).toMatchObject({
      ref: { source: 'builtin', capabilityId: 'write_file' },
      providerName: 'write_file',
      displayName: 'Write file',
    });
  });

  test('adds a text extension when the model omits one', async () => {
    const files = createFilesPort();

    await execute(createWriteFileTool(files), { content: 'notes', filename: 'meeting notes' });

    expect(files.createTextEntry).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'text/plain', name: 'meeting notes.txt' }),
    );
  });

  test('drops a trailing dot rather than storing an empty extension', async () => {
    const files = createFilesPort();

    await execute(createWriteFileTool(files), { content: 'x', filename: 'draft.' });

    expect(files.createTextEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'draft.txt' }),
    );
  });

  test.each([
    ['csv', 'text/csv'],
    ['html', 'text/html'],
    ['json', 'application/json'],
    ['yml', 'application/yaml'],
    // Source code stays text/plain: `ts` is video/mp2t in the IANA registry.
    ['ts', 'text/plain'],
    ['unknownext', 'text/plain'],
  ])('maps .%s to %s', async (extension, mediaType) => {
    const files = createFilesPort();

    await execute(createWriteFileTool(files), { content: 'x', filename: `data.${extension}` });

    expect(files.createTextEntry).toHaveBeenCalledWith(expect.objectContaining({ mediaType }));
  });

  test.each([
    ['a path separator', 'docs/report.md'],
    ['a parent directory', '..'],
    ['only whitespace', '   '],
    ['a name that cannot fit an extension', `${'a'.repeat(255)}`],
  ])('rejects %s without writing', async (_case, filename) => {
    const files = createFilesPort();

    const output = await execute(createWriteFileTool(files), { content: 'x', filename });

    expect(output).toEqual({
      value: { status: 'error', message: expect.stringContaining('filename') },
      artifacts: [],
    });
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('rejects unknown input keys', async () => {
    const files = createFilesPort();

    const output = await execute(createWriteFileTool(files), {
      content: 'x',
      filename: 'notes.txt',
      path: '/etc/passwd',
    });

    expect(output).toEqual({
      value: { status: 'error', message: expect.stringContaining('Invalid input') },
      artifacts: [],
    });
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('measures the content limit in bytes, not characters', async () => {
    const files = createFilesPort();
    // Three bytes per character: under the limit by length, over it by size.
    const content = '中'.repeat(WRITE_FILE_MAX_CONTENT_BYTES / 2);

    const output = await execute(createWriteFileTool(files), { content, filename: 'big.txt' });

    expect(output).toEqual({
      value: { status: 'error', message: expect.stringContaining('limit') },
      artifacts: [],
    });
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('lets storage failures surface as a tool error', async () => {
    const files = createFilesPort();
    files.createTextEntry.mockRejectedValueOnce(new Error('disk full'));

    await expect(
      execute(createWriteFileTool(files), { content: 'x', filename: 'notes.txt' }),
    ).rejects.toThrow('disk full');
  });

  test('does not start a write after the turn is cancelled', async () => {
    const files = createFilesPort();
    const tool = createWriteFileTool(files);
    const controller = new AbortController();
    controller.abort(new Error('turn cancelled'));

    await expect(
      tool.execute({
        input: { content: 'late', filename: 'late.txt' },
        signal: controller.signal,
        toolCallId: 'call-1',
      }),
    ).rejects.toThrow('turn cancelled');
    expect(files.createTextEntry).not.toHaveBeenCalled();
  });

  test('exposes a portable JSON Schema that forbids extra keys', () => {
    const { inputSchema } = createWriteFileTool(createFilesPort());

    expect(inputSchema).toEqual({
      type: 'object',
      properties: {
        content: expect.objectContaining({ type: 'string' }),
        filename: expect.objectContaining({ type: 'string' }),
      },
      required: expect.arrayContaining(['content', 'filename']),
      additionalProperties: false,
    });
  });
});

function createFilesPort() {
  const createTextEntry = jest.fn(
    async (input: {
      data: string;
      mediaType: string;
      name: string;
      provenance: FileEntryProvenance;
    }) =>
      FileEntrySchema.parse({
        createdAt: 1,
        filename: input.name,
        id: '00000000-0000-7000-8000-000000000001',
        mediaType: input.mediaType,
        provenance: input.provenance,
        size: new TextEncoder().encode(input.data).length,
        updatedAt: 1,
      }),
  );
  return { createTextEntry } satisfies WriteFileFiles & { createTextEntry: jest.Mock };
}

function execute(
  tool: ReturnType<typeof createWriteFileTool>,
  input: RuntimeJsonValue,
): Promise<RuntimeToolResult> {
  return tool.execute({ input, signal: new AbortController().signal, toolCallId: 'call-1' });
}
