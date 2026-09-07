import { parseAnydocDocument } from '@/backend/services/file/anydocParser';
import type { FileEntryId } from '@/shared/data/types/file';

import type { ManagedFileFact, TurnFileScope } from '../../resources/managedFileResolver';
import type { RuntimeJsonValue, RuntimeToolResult } from '../../runtime';
import {
  createReadFileTool,
  lineWindow,
  jsonCharacterWindow,
  READ_FILE_DEFAULT_LINE_LIMIT,
  READ_FILE_MAX_CHARACTERS,
  READ_FILE_MAX_SOURCE_BYTES,
  type ReadFileFiles,
} from '../readFileTool';

const FILE_ID = '00000000-0000-7000-8000-000000000001' as FileEntryId;
const OTHER_ID = '00000000-0000-7000-8000-000000000002' as FileEntryId;
const IN_SCOPE: TurnFileScope = { fileEntryIds: new Set([FILE_ID]) };

jest.mock('@/backend/services/file/anydocParser', () => ({
  ANYDOC_PARSER_VERSION: '0.4.1',
  parseAnydocDocument: jest.fn(),
}));

describe('AnyDoc raw JSON reads', () => {
  function documentFiles() {
    const files = createFiles('document');
    files.resolveAvailable.mockResolvedValue(
      new Map([
        [
          FILE_ID,
          { fileEntryId: FILE_ID, mediaType: 'application/rtf', name: 'report.rtf', size: 8 },
        ],
      ]),
    );
    return files;
  }

  test('recovers an original long JSON string, unknown fields, and emoji through nextOffset', async () => {
    const ir = { future: { text: '中文🍒\\"\n'.repeat(25_000) }, styles: ['italic', null, 3] };
    jest.mocked(parseAnydocDocument).mockResolvedValue({
      status: 'ok',
      ir,
      warnings: ['original'],
      assets: [
        {
          assetRef: 'image-ref',
          contentType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]).buffer,
        },
      ],
    });
    const tool = createReadFileTool(documentFiles(), IN_SCOPE, 'anydoc');
    const fragments: string[] = [];
    let offset = 0;
    for (;;) {
      const result = await execute(tool, {
        file_entry_id: FILE_ID,
        offset,
        max_characters: READ_FILE_MAX_CHARACTERS,
      });
      expect(result.artifacts).toEqual([]);
      expect(result.value).toMatchObject({
        status: 'ok',
        format: 'json-fragment',
        parser: 'anydoc',
        parserVersion: '0.4.1',
        offset,
        warnings: ['original'],
        assets: [
          { assetRef: 'image-ref', contentType: 'image/png', size: 3, delivery: 'reference-only' },
        ],
      });
      const value = result.value as {
        text: string;
        characterCount: number;
        nextOffset: number | null;
        complete: boolean;
      };
      fragments.push(value.text);
      expect([...value.text].length).toBe(value.characterCount);
      expect(value.characterCount).toBeLessThanOrEqual(READ_FILE_MAX_CHARACTERS);
      expect(JSON.stringify(result)).not.toContain('base64');
      if (value.nextOffset === null) {
        expect(value.complete).toBe(true);
        break;
      }
      expect(value.nextOffset).toBe(offset + value.characterCount);
      offset = value.nextOffset;
    }
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.join('')).toBe(JSON.stringify(ir));
    expect(JSON.parse(fragments.join(''))).toEqual(ir);
  });

  test('rejects mixed or format-inapplicable pagination rather than ignoring parameters', async () => {
    jest
      .mocked(parseAnydocDocument)
      .mockResolvedValue({ status: 'ok', ir: { text: 'body' }, warnings: [], assets: [] });
    const files = documentFiles();
    const tool = createReadFileTool(files, IN_SCOPE, 'anydoc');
    expectError(
      await execute(tool, { file_entry_id: FILE_ID, offset: 0, start_line: 1 }),
      'cannot be combined',
    );
    expect(files.readAsBytes).not.toHaveBeenCalled();
    expectError(await execute(tool, { file_entry_id: FILE_ID, limit: 2 }), 'requires offset');
    expectError(
      await execute(createReadFileTool(createFiles('text'), IN_SCOPE), {
        file_entry_id: FILE_ID,
        max_characters: 2,
      }),
      'requires start_line',
    );
    for (const params of [
      { offset: -1 },
      { max_characters: 0 },
      { max_characters: READ_FILE_MAX_CHARACTERS + 1 },
    ]) {
      expectError(await execute(tool, { file_entry_id: FILE_ID, ...params }), 'Invalid input');
    }
  });

  test('returns the original parser failure without invoking the built-in parser', async () => {
    const failure = {
      status: 'fallback' as const,
      reason: 'parse-error',
      detail: 'original failure detail',
    };
    jest.mocked(parseAnydocDocument).mockResolvedValue(failure);
    const files = documentFiles();
    const result = await execute(createReadFileTool(files, IN_SCOPE, 'anydoc'), {
      file_entry_id: FILE_ID,
    });
    expect(result.value).toMatchObject({ status: 'error', parser: 'anydoc', result: failure });
    expect(files.readDocumentText).not.toHaveBeenCalled();
  });

  test('keeps out-of-scope AnyDoc bytes unreadable and exposes only references, never new grants', async () => {
    const files = documentFiles();
    expectError(
      await execute(createReadFileTool(files, IN_SCOPE, 'anydoc'), {
        file_entry_id: OTHER_ID,
        offset: 0,
      }),
      'not part of this conversation',
    );
    expect(files.resolveAvailable).not.toHaveBeenCalled();
    expect(IN_SCOPE.fileEntryIds).toEqual(new Set([FILE_ID]));
  });
});

describe('JSON character windows', () => {
  test('addresses Unicode code points without splitting a surrogate pair at either edge', () => {
    expect(jsonCharacterWindow('中🍒文🙂尾', 1, 3)).toEqual({
      offset: 1,
      characterCount: 3,
      totalCharacters: 5,
      nextOffset: 4,
      complete: false,
      text: '🍒文🙂',
    });
    expect(jsonCharacterWindow('中🍒文🙂尾', 4, 3)).toEqual({
      offset: 4,
      characterCount: 1,
      totalCharacters: 5,
      nextOffset: null,
      complete: true,
      text: '尾',
    });
    expect(jsonCharacterWindow('中🍒', 9, 3)).toMatchObject({
      characterCount: 0,
      complete: true,
      text: '',
      nextOffset: null,
    });
  });
});

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

  test('pages extracted documents and distinguishes extraction limits from remaining lines', async () => {
    const files = createFiles('binary');
    files.resolveAvailable.mockResolvedValueOnce(
      new Map([
        [
          FILE_ID,
          {
            fileEntryId: FILE_ID,
            mediaType: 'application/pdf',
            name: 'report.pdf',
            size: 2 * 1024 * 1024,
          },
        ],
      ]),
    );
    files.readDocumentText.mockResolvedValueOnce({ text: 'first\nsecond\nthird', truncated: true });

    const output = await execute(createReadFileTool(files, IN_SCOPE), {
      file_entry_id: FILE_ID,
      start_line: 2,
      limit: 2,
    });

    expect(output.value).toMatchObject({
      filename: 'report.pdf',
      text: 'second\nthird',
      startLine: 2,
      lineCount: 2,
      totalLines: 3,
      truncated: false,
      sourceTruncated: true,
    });
    expect(files.readAsBytes).not.toHaveBeenCalled();
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
  const readDocumentText = jest.fn<
    ReturnType<ReadFileFiles['readDocumentText']>,
    Parameters<ReadFileFiles['readDocumentText']>
  >(async () => undefined);
  return { readAsBytes, readDocumentText, resolveAvailable } satisfies ReadFileFiles & {
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
