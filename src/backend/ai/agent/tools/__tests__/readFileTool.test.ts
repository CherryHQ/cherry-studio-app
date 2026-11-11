import { parseAnydocDocument } from '@/backend/services/file/anydocParser';
import type { DocumentParserMode } from '@/shared/contracts/fileAttachment';
import type { FileEntryId } from '@/shared/data/types/file';
import { MAX_PDF_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import type { ManagedFileFact, TurnFileScope } from '../../resources/managedFileResolver';
import type { RuntimeJsonValue, RuntimeToolResult } from '../../runtime';
import {
  createReadFileTool,
  lineWindow,
  characterWindow,
  READ_FILE_DEFAULT_LINE_LIMIT,
  READ_FILE_MAX_CHARACTERS,
  READ_FILE_MAX_SOURCE_BYTES,
  READ_FILE_MAX_TEXT_BYTES,
  type ReadFileFiles,
} from '../readFileTool';
import type { WorkspaceFileAccess } from '../workspaceFileAccess';

const FILE_ID = '00000000-0000-7000-8000-000000000001' as FileEntryId;
const OTHER_ID = '00000000-0000-7000-8000-000000000002' as FileEntryId;
const IN_SCOPE: TurnFileScope = { fileEntryIds: new Set([FILE_ID]) };
/** Pi keeps only the first 50 KiB of a model-facing tool result. */
const PI_TOOL_OUTPUT_BYTES = 50 * 1024;
const serializedSize = (result: RuntimeToolResult) =>
  Buffer.byteLength(JSON.stringify(result), 'utf8');

jest.mock('@/backend/services/file/anydocParser', () => ({
  ANYDOC_PARSER_VERSION: '0.4.1',
  parseAnydocDocument: jest.fn(),
}));

test('every PDF text window retains unrecognized page metadata, including windows past the notice', async () => {
  const files = createFiles('pdf');
  files.resolveAvailable.mockResolvedValue(
    new Map([
      [
        FILE_ID,
        {
          fileEntryId: FILE_ID,
          mediaType: 'application/pdf',
          name: 'scan.pdf',
          size: 3,
        },
      ],
    ]),
  );
  files.readDocumentText.mockResolvedValue({
    text: 'Extraction notice\nBody',
    truncated: false,
    unrecognizedPages: [1, 3],
  });
  const tool = createReadFileTool(files, IN_SCOPE);
  const result = await execute(tool, { file_entry_id: FILE_ID, start_line: 2, limit: 1 });
  expect(result.value).toMatchObject({ text: 'Body', unrecognizedPages: [1, 3] });
});

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
      expect(serializedSize(result)).toBeLessThanOrEqual(PI_TOOL_OUTPUT_BYTES);
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
    const invalidPaginationParams: Record<string, number>[] = [
      { offset: -1 },
      { max_characters: 0 },
      { max_characters: READ_FILE_MAX_CHARACTERS + 1 },
    ];
    for (const params of invalidPaginationParams) {
      expectError(await execute(tool, { file_entry_id: FILE_ID, ...params }), 'Invalid input');
    }
  });

  test('parses a document once while paging it', async () => {
    jest.mocked(parseAnydocDocument).mockClear();
    jest
      .mocked(parseAnydocDocument)
      .mockResolvedValue({ status: 'ok', ir: { text: 'body' }, warnings: [], assets: [] });
    const tool = createReadFileTool(documentFiles(), IN_SCOPE, 'anydoc');

    const first = await execute(tool, { file_entry_id: FILE_ID, max_characters: 5 });
    const second = await execute(tool, { file_entry_id: FILE_ID, offset: 5 });

    expect(parseAnydocDocument).toHaveBeenCalledTimes(1);
    expect((first.value as { text: string }).text + (second.value as { text: string }).text).toBe(
      '{"text":"body"}',
    );
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

describe('character windows', () => {
  test('addresses Unicode code points without splitting a surrogate pair at either edge', () => {
    expect(characterWindow('中🍒文🙂尾', 1, 3)).toEqual({
      offset: 1,
      characterCount: 3,
      totalCharacters: 5,
      nextOffset: 4,
      complete: false,
      text: '🍒文🙂',
    });
    expect(characterWindow('中🍒文🙂尾', 4, 3)).toEqual({
      offset: 4,
      characterCount: 1,
      totalCharacters: 5,
      nextOffset: null,
      complete: true,
      text: '尾',
    });
    expect(characterWindow('中🍒', 9, 3)).toMatchObject({
      characterCount: 0,
      complete: true,
      text: '',
      nextOffset: null,
    });
  });
});

describe('readFileTool', () => {
  test('a text-only model pages OCR text without receiving or reading pixels', async () => {
    const files = createFiles('unused');
    files.resolveAvailable.mockResolvedValue(
      new Map([
        [
          FILE_ID,
          {
            fileEntryId: FILE_ID,
            mediaType: 'image/png',
            name: 'receipt.png',
            size: 12,
          },
        ],
      ]),
    );
    const readImage = jest.fn();
    const readImageText = jest.fn(async () => ({ text: 'Total\n42', truncated: false }));
    const tool = createReadFileTool(
      { ...files, readImage, readImageText },
      IN_SCOPE,
      'builtin',
      undefined,
      false,
    );
    expectError(await execute(tool, { file_entry_id: OTHER_ID }), 'not part');
    expect(readImageText).not.toHaveBeenCalled();
    const first = await execute(tool, { file_entry_id: FILE_ID, start_line: 1, limit: 1 });
    expect(first).toMatchObject({
      value: { status: 'ok', parser: 'native-image-ocr', text: 'Total', truncated: true },
      artifacts: [],
    });
    expect(first).not.toHaveProperty('modelImages');
    const second = await execute(tool, { file_entry_id: FILE_ID, offset: 6 });
    expect(second).toMatchObject({ value: { status: 'ok', text: '42', complete: true } });
    expect(readImageText).toHaveBeenCalledTimes(1);
    expect(readImage).not.toHaveBeenCalled();
    expect(files.readAsBytes).not.toHaveBeenCalled();
  });

  test('tells a text-only model why an image has no OCR text, and reports a missing file as unavailable', async () => {
    const files = createFiles('unused');
    const photo = { fileEntryId: FILE_ID, mediaType: 'image/png', name: 'photo.png', size: 12 };
    files.resolveAvailable.mockResolvedValue(new Map([[FILE_ID, photo]]));
    const tool = createReadFileTool(files, IN_SCOPE, 'builtin', undefined, false);
    files.readImageText.mockResolvedValueOnce({ text: ' ', truncated: false });
    expectError(await execute(tool, { file_entry_id: FILE_ID }), 'vision-capable model is needed');
    files.readImageText.mockResolvedValueOnce(undefined);
    expectError(await execute(tool, { file_entry_id: FILE_ID }), ': unavailable');
  });

  test('reads bounded pixels only for an in-scope image without paging parameters', async () => {
    const files = createFiles('unused');
    files.resolveAvailable.mockResolvedValue(
      new Map([
        [
          FILE_ID,
          {
            fileEntryId: FILE_ID,
            mediaType: 'image/png',
            name: 'chart.png',
            size: 12,
          },
        ],
      ]),
    );
    const readImage = jest.fn(async () => ({ data: 'cGl4ZWxz', mediaType: 'image/png' }));
    const tool = createReadFileTool({ ...files, readImage }, IN_SCOPE);
    expectError(await execute(tool, { file_entry_id: OTHER_ID }), 'not part');
    expectError(await execute(tool, { file_entry_id: FILE_ID, offset: 0 }), 'paging');
    expect(readImage).not.toHaveBeenCalled();
    const output = await execute(tool, { file_entry_id: FILE_ID });
    expect(output).toMatchObject({
      value: { status: 'ok', fileEntryId: FILE_ID, mediaType: 'image/png' },
      modelImages: [{ data: 'cGl4ZWxz', mediaType: 'image/png' }],
      artifacts: [],
    });
    expect(JSON.stringify(output.value)).not.toContain('cGl4ZWxz');
    expect(files.readAsBytes).not.toHaveBeenCalled();
  });

  describe('image paging validation', () => {
    const IMAGE_PAGING_MESSAGE =
      'Images do not support paging parameters. Retry this read_file call without start_line, limit, offset, or max_characters.';
    const MIXED_PAGING_MESSAGE = 'Line parameters and offset parameters cannot be combined.';
    const INVALID_START_LINE_MESSAGE =
      'Invalid input: ✖ Too small: expected number to be >=1\n  → at start_line';
    const ALL_PAGING = { start_line: 1, limit: 1, offset: 0, max_characters: 100 };
    const IMAGE_SUCCESS = {
      value: {
        status: 'ok',
        fileEntryId: FILE_ID,
        filename: 'chart.png',
        mediaType: 'image/png',
        delivery:
          'image-to-model; scripts receive metadata only; read again if pixels are unavailable after rebuilding history',
      },
      modelImages: [{ data: 'cGl4ZWxz', mediaType: 'image/png' }],
      artifacts: [],
    };

    beforeEach(() => {
      jest.mocked(parseAnydocDocument).mockClear();
    });

    function imageFiles(overrides: Partial<ManagedFileFact> = {}) {
      const files = createFiles('unused');
      files.resolveAvailable.mockResolvedValue(
        new Map([
          [
            FILE_ID,
            {
              fileEntryId: FILE_ID,
              mediaType: 'image/png',
              name: 'chart.png',
              size: 12,
              ...overrides,
            },
          ],
        ]),
      );
      const readImage = jest.fn(async () => ({ data: 'cGl4ZWxz', mediaType: 'image/png' }));
      return { ...files, readImage };
    }

    function expectNoContentReads(files: ReturnType<typeof imageFiles>) {
      expect(files.readImage).not.toHaveBeenCalled();
      expect(files.readAsBytes).not.toHaveBeenCalled();
      expect(files.readDocumentText).not.toHaveBeenCalled();
      expect(files.readImageText).not.toHaveBeenCalled();
      expect(parseAnydocDocument).not.toHaveBeenCalled();
    }

    test.each<Record<string, number>>([
      { start_line: 1 },
      { limit: 1 },
      { offset: 0 },
      { max_characters: 1 },
      { start_line: 1, offset: 0 },
      { start_line: 1, max_characters: 1 },
      { limit: 1, offset: 0 },
      { limit: 1, max_characters: 1 },
      ALL_PAGING,
    ])(
      'rejects every supplied direct-image paging parameter with recovery guidance: %j',
      async (paging) => {
        const files = imageFiles();
        const result = await execute(createReadFileTool(files, IN_SCOPE), {
          file_entry_id: FILE_ID,
          ...paging,
        });
        expect(result).toEqual({
          value: { status: 'error', message: IMAGE_PAGING_MESSAGE },
          artifacts: [],
        });
        expect(result).not.toHaveProperty('modelImages');
        expect(files.resolveAvailable).toHaveBeenCalledTimes(1);
        expectNoContentReads(files);
      },
    );

    test('returns the same guidance for identical calls and reads pixels after paging is removed', async () => {
      const files = imageFiles();
      const tool = createReadFileTool(files, IN_SCOPE);
      for (let call = 1; call <= 2; call++) {
        expect(await execute(tool, { file_entry_id: FILE_ID, ...ALL_PAGING })).toEqual({
          value: { status: 'error', message: IMAGE_PAGING_MESSAGE },
          artifacts: [],
        });
        expect(files.resolveAvailable).toHaveBeenCalledTimes(call);
        expectNoContentReads(files);
      }
      expect(await execute(tool, { file_entry_id: FILE_ID })).toEqual(IMAGE_SUCCESS);
      expect(files.resolveAvailable).toHaveBeenCalledTimes(3);
      expect(files.readImage).toHaveBeenCalledTimes(1);
      expect(files.readAsBytes).not.toHaveBeenCalled();
      expect(files.readDocumentText).not.toHaveBeenCalled();
      expect(files.readImageText).not.toHaveBeenCalled();
      expect(parseAnydocDocument).not.toHaveBeenCalled();
    });

    test.each<{
      name: string;
      mediaType: string;
      filename: string;
      parser: DocumentParserMode;
      acceptsImages: boolean;
    }>([
      {
        name: 'text',
        mediaType: 'text/plain',
        filename: 'notes.txt',
        parser: 'builtin',
        acceptsImages: true,
      },
      {
        name: 'built-in PDF',
        mediaType: 'application/pdf',
        filename: 'scan.pdf',
        parser: 'builtin',
        acceptsImages: true,
      },
      {
        name: 'AnyDoc PDF',
        mediaType: 'application/pdf',
        filename: 'scan.pdf',
        parser: 'anydoc',
        acceptsImages: true,
      },
      {
        name: 'AnyDoc RTF',
        mediaType: 'application/rtf',
        filename: 'report.rtf',
        parser: 'anydoc',
        acceptsImages: true,
      },
      {
        name: 'OCR',
        mediaType: 'image/png',
        filename: 'receipt.png',
        parser: 'builtin',
        acceptsImages: false,
      },
      {
        name: 'audio',
        mediaType: 'audio/mpeg',
        filename: 'recording.mp3',
        parser: 'builtin',
        acceptsImages: true,
      },
      {
        name: 'unsupported image MIME',
        mediaType: 'image/avif',
        filename: 'photo.avif',
        parser: 'builtin',
        acceptsImages: true,
      },
      {
        name: 'text with image extension',
        mediaType: 'text/plain',
        filename: 'chart.png',
        parser: 'builtin',
        acceptsImages: true,
      },
    ])(
      'rejects mixed paging before reading $name content',
      async ({ mediaType, filename, parser, acceptsImages }) => {
        const files = imageFiles({ mediaType, name: filename });
        expect(
          await execute(createReadFileTool(files, IN_SCOPE, parser, undefined, acceptsImages), {
            file_entry_id: FILE_ID,
            start_line: 1,
            offset: 0,
          }),
        ).toEqual({ value: { status: 'error', message: MIXED_PAGING_MESSAGE }, artifacts: [] });
        expect(files.resolveAvailable).toHaveBeenCalledTimes(1);
        expectNoContentReads(files);
      },
    );

    describe('preserves pre-read error precedence for mixed paging', () => {
      test.each([
        {
          name: 'schema-invalid input',
          input: { file_entry_id: FILE_ID, ...ALL_PAGING, start_line: 0 },
          message: INVALID_START_LINE_MESSAGE,
        },
        {
          name: 'missing id',
          input: { ...ALL_PAGING },
          message: 'Provide a managed file_entry_id.',
        },
        {
          name: 'path-only reference without access adapter',
          input: { path: 'chart.png', ...ALL_PAGING },
          message: 'Provide a managed file_entry_id.',
        },
        {
          name: 'id plus path without access adapter',
          input: { file_entry_id: FILE_ID, path: 'chart.png', ...ALL_PAGING },
          message: 'Provide a managed file_entry_id.',
        },
        {
          name: 'out-of-scope id',
          input: { file_entry_id: OTHER_ID, ...ALL_PAGING },
          message: 'The file is not part of this conversation.',
        },
      ])('$name', async ({ input, message }) => {
        const files = imageFiles();
        expect(await execute(createReadFileTool(files, IN_SCOPE), input)).toEqual({
          value: { status: 'error', message },
          artifacts: [],
        });
        expect(files.resolveAvailable).not.toHaveBeenCalled();
        expectNoContentReads(files);
      });

      test('workspace-access rejection', async () => {
        const files = imageFiles();
        const error = new Error('workspace access denied');
        const resolveRead = jest.fn().mockRejectedValue(error);
        const access = { resolveRead } as unknown as WorkspaceFileAccess;
        await expect(
          execute(createReadFileTool(files, IN_SCOPE, 'builtin', access), {
            path: 'chart.png',
            ...ALL_PAGING,
          }),
        ).rejects.toBe(error);
        expect(resolveRead).toHaveBeenCalledTimes(1);
        expect(files.resolveAvailable).not.toHaveBeenCalled();
        expectNoContentReads(files);
      });

      test.each([false, true])(
        'already-aborted signal with workspace access: %s',
        async (useAccess) => {
          const files = imageFiles();
          const controller = new AbortController();
          const error = new Error('turn cancelled');
          controller.abort(error);
          const resolveRead = jest.fn().mockResolvedValue(FILE_ID);
          const access = useAccess
            ? ({ resolveRead } as unknown as WorkspaceFileAccess)
            : undefined;
          await expect(
            createReadFileTool(files, IN_SCOPE, 'builtin', access).execute({
              input: { file_entry_id: FILE_ID, ...ALL_PAGING },
              signal: controller.signal,
              toolCallId: 'call-1',
              turnId: 'turn-1',
            }),
          ).rejects.toBe(error);
          expect(resolveRead).toHaveBeenCalledTimes(useAccess ? 1 : 0);
          expect(files.resolveAvailable).not.toHaveBeenCalled();
          expectNoContentReads(files);
        },
      );

      test('authorized id absent from resolver', async () => {
        const files = imageFiles();
        files.resolveAvailable.mockResolvedValue(new Map());
        expect(
          await execute(createReadFileTool(files, IN_SCOPE), {
            file_entry_id: FILE_ID,
            ...ALL_PAGING,
          }),
        ).toEqual({
          value: { status: 'error', message: 'The managed file is unavailable.' },
          artifacts: [],
        });
        expect(files.resolveAvailable).toHaveBeenCalledTimes(1);
        expectNoContentReads(files);
      });

      test('resolver throwing', async () => {
        const files = imageFiles();
        const error = new Error('source resolution failed');
        files.resolveAvailable.mockRejectedValue(error);
        await expect(
          execute(createReadFileTool(files, IN_SCOPE), { file_entry_id: FILE_ID, ...ALL_PAGING }),
        ).rejects.toBe(error);
        expect(files.resolveAvailable).toHaveBeenCalledTimes(1);
        expectNoContentReads(files);
      });

      test('allowed workspace-path PNG', async () => {
        const files = imageFiles();
        const resolveRead = jest.fn().mockResolvedValue(FILE_ID);
        const access = { resolveRead } as unknown as WorkspaceFileAccess;
        expect(
          await execute(createReadFileTool(files, IN_SCOPE, 'builtin', access), {
            path: 'chart.png',
            ...ALL_PAGING,
          }),
        ).toEqual({ value: { status: 'error', message: IMAGE_PAGING_MESSAGE }, artifacts: [] });
        expect(resolveRead).toHaveBeenCalledTimes(1);
        expect(files.resolveAvailable).toHaveBeenCalledTimes(1);
        expectNoContentReads(files);
      });
    });

    test.each([
      {
        name: 'schema-invalid start line',
        size: 12,
        startLine: 0,
        message: INVALID_START_LINE_MESSAGE,
        resolverCalls: 0,
      },
      {
        name: 'exact image byte limit',
        size: 10_485_760,
        startLine: 1,
        message: IMAGE_PAGING_MESSAGE,
        resolverCalls: 1,
      },
      {
        name: 'above image byte limit',
        size: 10_485_761,
        startLine: 1,
        message: 'The image exceeds the attachment byte limit.',
        resolverCalls: 1,
      },
    ])(
      'keeps schema and image-size validation ahead of image paging: $name',
      async ({ size, startLine, message, resolverCalls }) => {
        const files = imageFiles({ size });
        expect(
          await execute(createReadFileTool(files, IN_SCOPE), {
            file_entry_id: FILE_ID,
            ...ALL_PAGING,
            start_line: startLine,
          }),
        ).toEqual({ value: { status: 'error', message }, artifacts: [] });
        expect(files.resolveAvailable).toHaveBeenCalledTimes(resolverCalls);
        expectNoContentReads(files);
      },
    );

    test('reads pixels without paging at the exact image byte limit', async () => {
      const files = imageFiles({ size: 10_485_760 });
      expect(
        await execute(createReadFileTool(files, IN_SCOPE), { file_entry_id: FILE_ID }),
      ).toEqual(IMAGE_SUCCESS);
      expect(files.resolveAvailable).toHaveBeenCalledTimes(1);
      expect(files.readImage).toHaveBeenCalledTimes(1);
      expect(files.readAsBytes).not.toHaveBeenCalled();
      expect(files.readDocumentText).not.toHaveBeenCalled();
      expect(files.readImageText).not.toHaveBeenCalled();
      expect(parseAnydocDocument).not.toHaveBeenCalled();
    });
  });

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
            size: MAX_PDF_ATTACHMENT_BYTES,
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

  test('reads text holding control characters other than NUL', async () => {
    const text = '\u001b[31mfailed\u001b[0m\fnext';
    const output = await execute(createReadFileTool(createFiles(text), IN_SCOPE), {
      file_entry_id: FILE_ID,
    });
    expect(output.value).toMatchObject({ status: 'ok', text });
  });

  test('reads ordinary text as a code-point window', async () => {
    const files = createFiles('ab\n🍒cd');
    const output = await execute(createReadFileTool(files, IN_SCOPE), {
      file_entry_id: FILE_ID,
      offset: 3,
      max_characters: 2,
    });
    expect(output.value).toMatchObject({
      status: 'ok',
      offset: 3,
      characterCount: 2,
      totalCharacters: 6,
      nextOffset: 5,
      complete: false,
      text: '🍒c',
    });
  });

  test('reads beyond the old 1 MiB text ceiling without expanding the output window', async () => {
    const prefix = 'x'.repeat(2 * 1024 * 1024);
    const tool = createReadFileTool(createFiles(`${prefix}🍒tail`), IN_SCOPE);
    const output = await execute(tool, {
      file_entry_id: FILE_ID,
      offset: prefix.length,
      max_characters: 2,
    });
    expect(output.value).toMatchObject({
      status: 'ok',
      text: '🍒t',
      characterCount: 2,
      nextOffset: prefix.length + 2,
      complete: false,
    });
  });

  test('pages Chinese text without losing what Pi would cut from an oversized result', async () => {
    const lines = Array.from(
      { length: 600 },
      (_, index) => `第${index}行「中文」\t${'内容'.repeat(60)}`,
    );
    const tool = createReadFileTool(createFiles(lines.join('\n')), IN_SCOPE);
    const read: string[] = [];
    for (let startLine = 1; startLine <= lines.length;) {
      const result = await execute(tool, { file_entry_id: FILE_ID, start_line: startLine });
      expect(serializedSize(result)).toBeLessThanOrEqual(PI_TOOL_OUTPUT_BYTES);
      const value = result.value as { text: string; lineCount: number };
      read.push(value.text);
      startLine += value.lineCount;
    }
    expect(read.length).toBeGreaterThan(1);
    expect(read.join('\n')).toBe(lines.join('\n'));

    const fragments: string[] = [];
    for (let offset: number | null = 0; offset !== null;) {
      const result = await execute(tool, { file_entry_id: FILE_ID, offset });
      expect(serializedSize(result)).toBeLessThanOrEqual(PI_TOOL_OUTPUT_BYTES);
      const value = result.value as { text: string; nextOffset: number | null };
      fragments.push(value.text);
      offset = value.nextOffset;
    }
    expect(fragments.join('')).toBe(lines.join('\n'));
  });

  test('continues a line longer than one window through nextOffset', async () => {
    const long = `${'x'.repeat(READ_FILE_MAX_TEXT_BYTES)}🍒tail`;
    const tool = createReadFileTool(createFiles(`a🍒\n${long}\nlast`), IN_SCOPE);

    const head = await execute(tool, { file_entry_id: FILE_ID, start_line: 2 });
    expect(head.value).toMatchObject({ lineCount: 1, lineTruncated: true, truncated: true });
    const { nextOffset } = head.value as { nextOffset: number };
    const rest = await execute(tool, { file_entry_id: FILE_ID, offset: nextOffset });

    expect((rest.value as { text: string }).text).toBe('🍒tail\nlast');
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
        turnId: 'turn-1',
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

  test('cuts on a line boundary at the size budget', () => {
    const line = 'x'.repeat(READ_FILE_MAX_TEXT_BYTES / 2);
    const window = lineWindow([line, line, line].join('\n'), 1, 10);

    // Two half-budget lines plus their separator exceed the budget, so one fits.
    expect(window).toEqual({
      lineCount: 1,
      text: line,
      totalLines: 3,
      truncated: true,
    });
  });

  test('flags the head of a single line that alone exceeds the budget', () => {
    const window = lineWindow('y'.repeat(READ_FILE_MAX_TEXT_BYTES + 1), 1, 10);
    expect(window.lineCount).toBe(1);
    expect(window.text).toHaveLength(READ_FILE_MAX_TEXT_BYTES);
    // A later line cannot reach the rest, so the window hands over its offset.
    expect(window.nextOffset).toBe(READ_FILE_MAX_TEXT_BYTES);
    expect(window.truncated).toBe(true);
  });

  test('cuts a long line on a code point', () => {
    const window = lineWindow('🍒'.repeat(READ_FILE_MAX_TEXT_BYTES), 1, 10);
    expect([...window.text]).toHaveLength(READ_FILE_MAX_TEXT_BYTES / 4);
    expect(window.text.endsWith('🍒')).toBe(true);
    expect(window.nextOffset).toBe(READ_FILE_MAX_TEXT_BYTES / 4);
  });

  test('returns a whole line that exactly fills the size budget', () => {
    const line = '🍒'.repeat(READ_FILE_MAX_TEXT_BYTES / 4);
    expect(lineWindow(line, 1, 10)).toEqual({
      lineCount: 1,
      text: line,
      totalLines: 1,
      truncated: false,
    });
  });

  test('does not count the empty tail of a newline-terminated file', () => {
    expect(lineWindow('a\nb\n', 1, 10)).toEqual({
      lineCount: 2,
      text: 'a\nb',
      totalLines: 2,
      truncated: false,
    });
  });

  test('reports a start line past the end as empty and complete', () => {
    expect(lineWindow('a\nb', 6, 10)).toEqual({
      lineCount: 0,
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
  const readImageText = jest.fn<
    ReturnType<ReadFileFiles['readImageText']>,
    Parameters<ReadFileFiles['readImageText']>
  >(async () => undefined);
  return {
    readAsBytes,
    readDocumentText,
    readImageText,
    resolveAvailable,
  } satisfies ReadFileFiles & {
    readAsBytes: jest.Mock;
    resolveAvailable: jest.Mock;
  };
}

function execute(
  tool: ReturnType<typeof createReadFileTool>,
  input: RuntimeJsonValue,
): Promise<RuntimeToolResult> {
  return tool.execute({
    input,
    signal: new AbortController().signal,
    toolCallId: 'call-1',
    turnId: 'turn-1',
  });
}

function expectError(output: RuntimeToolResult, message: string) {
  expect(output).toEqual({
    value: { status: 'error', message: expect.stringContaining(message) },
    artifacts: [],
  });
}
