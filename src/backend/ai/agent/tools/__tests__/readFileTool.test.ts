import type { FileEntryId } from '@/shared/data/types/file';

import type { ManagedFileFact, TurnFileScope } from '../../resources/managedFileResolver';
import type { RuntimeJsonValue, RuntimeToolResult } from '../../runtime';
import {
  createReadFileTool,
  lineWindow,
  READ_FILE_DEFAULT_LINE_LIMIT,
  READ_FILE_MAX_CHARACTERS,
  READ_FILE_MAX_SOURCE_BYTES,
  type ReadFileFiles,
} from '../readFileTool';

const FILE_ID = '00000000-0000-7000-8000-000000000001' as FileEntryId;
const OTHER_ID = '00000000-0000-7000-8000-000000000002' as FileEntryId;
const IN_SCOPE: TurnFileScope = { fileEntryIds: new Set([FILE_ID]) };

describe('readFileTool', () => {
  test('returns the whole file when it fits the default window', async () => {
    const files = createFiles('line 1\nline 2\n');
    const output = await execute(createReadFileTool(files, IN_SCOPE), { file_entry_id: FILE_ID });

    expect(output).toEqual({
      value: {
        status: 'ok',
        fileEntryId: FILE_ID,
        filename: 'notes.md',
        size: 14,
        startLine: 1,
        lineCount: 2,
        totalLines: 2,
        truncated: false,
        text: 'line 1\nline 2',
      },
      artifacts: [],
    });
  });

  test('pages by start line and limit', async () => {
    const files = createFiles('a\nb\nc\nd');
    const output = await execute(createReadFileTool(files, IN_SCOPE), {
      file_entry_id: FILE_ID,
      start_line: 2,
      limit: 2,
    });

    expect(output.value).toMatchObject({
      startLine: 2,
      lineCount: 2,
      totalLines: 4,
      truncated: true,
      text: 'b\nc',
    });
  });

  test('refuses a file outside the turn ledger before touching storage', async () => {
    const files = createFiles('secret');
    const output = await execute(createReadFileTool(files, IN_SCOPE), { file_entry_id: OTHER_ID });

    expectError(output, 'not part of this conversation');
    expect(files.resolveAvailable).not.toHaveBeenCalled();
  });

  test('exposes stable identity and automatic approval', () => {
    expect(createReadFileTool(createFiles('x'), IN_SCOPE)).toMatchObject({
      ref: { source: 'builtin', capabilityId: 'read_file' },
      providerName: 'read_file',
      displayName: 'Read file',
      approval: 'auto',
    });
  });

  test.each([
    ['an invalid id', { file_entry_id: 'nope' }],
    ['a start line below one', { file_entry_id: FILE_ID, start_line: 0 }],
    ['a zero limit', { file_entry_id: FILE_ID, limit: 0 }],
  ])('rejects %s', async (_case, input) => {
    const output = await execute(createReadFileTool(createFiles('x'), IN_SCOPE), input);
    expectError(output, 'Invalid input');
  });

  test('rejects unavailable, oversized, and binary sources', async () => {
    const missing = createFiles('x');
    missing.resolveAvailable.mockResolvedValueOnce(new Map());
    expectError(
      await execute(createReadFileTool(missing, IN_SCOPE), { file_entry_id: FILE_ID }),
      'unavailable',
    );

    const oversized = createFiles('x', READ_FILE_MAX_SOURCE_BYTES + 1);
    expectError(
      await execute(createReadFileTool(oversized, IN_SCOPE), { file_entry_id: FILE_ID }),
      'limit',
    );
    expect(oversized.readAsBytes).not.toHaveBeenCalled();

    const binary = createFiles(Uint8Array.from([65, 0, 66]));
    expectError(
      await execute(createReadFileTool(binary, IN_SCOPE), { file_entry_id: FILE_ID }),
      'NUL',
    );
  });

  test('propagates cancellation after the read', async () => {
    const files = createFiles('x');
    const controller = new AbortController();
    files.readAsBytes.mockImplementationOnce(async () => {
      controller.abort(new Error('turn cancelled'));
      return new TextEncoder().encode('x');
    });

    await expect(
      createReadFileTool(files, IN_SCOPE).execute({
        input: { file_entry_id: FILE_ID },
        signal: controller.signal,
        toolCallId: 'call-1',
      }),
    ).rejects.toThrow('turn cancelled');
  });

  test('exposes a strict portable schema without a UUID format', () => {
    const schema = createReadFileTool(createFiles('x'), IN_SCOPE).inputSchema;
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        file_entry_id: expect.objectContaining({ type: 'string' }),
        start_line: expect.objectContaining({ type: 'integer' }),
        limit: expect.objectContaining({ type: 'integer' }),
      },
      required: ['file_entry_id'],
      additionalProperties: false,
    });
    expect(schema).not.toMatchObject({
      properties: { file_entry_id: { format: expect.anything() } },
    });
  });
});

describe('lineWindow', () => {
  test('applies the default limit', () => {
    const text = Array.from({ length: READ_FILE_DEFAULT_LINE_LIMIT + 5 }, (_, i) => `${i}`).join(
      '\n',
    );
    const window = lineWindow(text, 1, READ_FILE_DEFAULT_LINE_LIMIT);
    expect(window.lineCount).toBe(READ_FILE_DEFAULT_LINE_LIMIT);
    expect(window.truncated).toBe(true);
  });

  test('cuts on a line boundary at the character budget', () => {
    const line = 'x'.repeat(READ_FILE_MAX_CHARACTERS / 2);
    const window = lineWindow([line, line, line].join('\n'), 1, 10);

    // Two half-budget lines plus their separator exceed the budget, so one fits.
    expect(window).toEqual({
      lineCount: 1,
      lineTruncated: false,
      text: line,
      totalLines: 3,
      truncated: true,
    });
  });

  test('flags the head of a single line that alone exceeds the budget', () => {
    const window = lineWindow('y'.repeat(READ_FILE_MAX_CHARACTERS + 1), 1, 10);
    expect(window.lineCount).toBe(1);
    expect(window.text).toHaveLength(READ_FILE_MAX_CHARACTERS);
    // The rest of the line is unreachable by paging, so the read is not complete.
    expect(window.lineTruncated).toBe(true);
    expect(window.truncated).toBe(true);
  });

  test('cuts a long line on a code point', () => {
    const window = lineWindow('🍒'.repeat(READ_FILE_MAX_CHARACTERS), 1, 10);
    expect([...window.text]).toHaveLength(READ_FILE_MAX_CHARACTERS);
    expect(window.text.endsWith('🍒')).toBe(true);
  });

  test('does not count the empty tail of a newline-terminated file', () => {
    expect(lineWindow('a\nb\n', 1, 10)).toEqual({
      lineCount: 2,
      lineTruncated: false,
      text: 'a\nb',
      totalLines: 2,
      truncated: false,
    });
  });

  test('reports a start line past the end as empty and complete', () => {
    expect(lineWindow('a\nb', 6, 10)).toEqual({
      lineCount: 0,
      lineTruncated: false,
      text: '',
      totalLines: 2,
      truncated: false,
    });
  });
});

function createFiles(content: string | Uint8Array, declaredSize?: number) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const source: ManagedFileFact = {
    fileEntryId: FILE_ID,
    mediaType: 'text/markdown',
    name: 'notes.md',
    size: declaredSize ?? bytes.byteLength,
  };
  const resolveAvailable = jest.fn(async () => new Map([[FILE_ID, source]]));
  const readAsBytes = jest.fn(async () => bytes);
  return { readAsBytes, resolveAvailable } satisfies ReadFileFiles & {
    readAsBytes: jest.Mock;
    resolveAvailable: jest.Mock;
  };
}

function execute(
  tool: ReturnType<typeof createReadFileTool>,
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
