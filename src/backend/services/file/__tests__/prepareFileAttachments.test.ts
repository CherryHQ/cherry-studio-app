import { FileAttachmentError, type FileAttachmentFact } from '@/shared/contracts/fileAttachment';
import { MAX_IMAGE_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import { parseAnydocDocument } from '../anydocParser';
import { prepareFileAttachments } from '../prepareFileAttachments';

jest.mock('../anydocParser', () => ({
  ANYDOC_PARSER_VERSION: '0.4.1',
  parseAnydocDocument: jest.fn(),
}));

const FILE_ID = '00000000-0000-7000-8000-000000000001';
const SECOND_ID = '00000000-0000-7000-8000-000000000002';
const text: FileAttachmentFact = {
  fileEntryId: FILE_ID,
  mediaType: 'text/plain',
  name: 'notes.txt',
  size: 5,
};
const image: FileAttachmentFact = { ...text, mediaType: 'image/png', name: 'image.png' };
const signal = () => new AbortController().signal;

function input(files: FileAttachmentFact[]) {
  return {
    availableFiles: new Map(files.map((file) => [file.fileEntryId, file])),
    currentFileEntryIds: files.map((file) => file.fileEntryId),
    readBytes: jest.fn(async () => new TextEncoder().encode('hello')),
    signal: signal(),
    target: { purpose: 'chat' as const, acceptsImages: true },
  };
}

describe('prepareFileAttachments', () => {
  test('rejects the whole request before reading when a later attachment is unsupported', async () => {
    const request = input([
      text,
      { ...text, fileEntryId: SECOND_ID, mediaType: 'application/zip' },
    ]);
    await expect(prepareFileAttachments(request)).rejects.toMatchObject({
      issue: { code: 'unsupported-type', fileEntryId: SECOND_ID },
    });
    expect(request.readBytes).not.toHaveBeenCalled();
  });

  test('shares image format, size and model admission across chat and painting', async () => {
    for (const purpose of ['chat', 'painting'] as const) {
      for (const [file, acceptsImages, code] of [
        [{ ...image, mediaType: 'image/heic' }, true, 'unsupported-type'],
        [{ ...image, size: MAX_IMAGE_ATTACHMENT_BYTES + 1 }, true, 'file-bytes'],
        [image, false, 'model-unsupported'],
      ] as const) {
        await expect(
          prepareFileAttachments({ ...input([file]), target: { purpose, acceptsImages } }),
        ).rejects.toMatchObject({ issue: { code } });
      }
    }
    await expect(
      prepareFileAttachments({
        ...input([text]),
        target: { purpose: 'painting', acceptsImages: true },
      }),
    ).rejects.toMatchObject({ issue: { code: 'unsupported-type' } });
  });

  test('uses the painting model count limit for the entire selection', async () => {
    await expect(
      prepareFileAttachments({
        ...input([image, { ...image, fileEntryId: SECOND_ID }]),
        target: { purpose: 'painting', acceptsImages: true, maxImages: 1 },
      }),
    ).rejects.toEqual(new FileAttachmentError({ code: 'count', limit: 1 }));
  });

  test('distinguishes source extraction from request truncation and charges repeated references', async () => {
    const document = { ...text, mediaType: 'application/pdf', name: 'report.pdf' };
    const request = input([document, { ...text, fileEntryId: SECOND_ID }]);
    const result = await prepareFileAttachments({
      ...request,
      historicalFileEntryIds: [FILE_ID],
      readDocumentText: async () => ({ text: 'abc', truncated: true }),
      limits: { maxBytesPerFile: 10, maxCharactersPerFile: 4, maxTotalCharacters: 8 },
    });
    expect(result.get(FILE_ID)).toMatchObject({
      content: { kind: 'text', text: 'abc' },
      report: { sourceTruncated: true, requestTruncated: false, includedCharacters: 3 },
    });
    expect(result.get(SECOND_ID)).toMatchObject({
      content: { kind: 'text', text: 'he' },
      report: { sourceTruncated: false, requestTruncated: true, includedCharacters: 2 },
    });
  });

  test('propagates cancellation even when a historical document is being read', async () => {
    const controller = new AbortController();
    const request = input([text]);
    await expect(
      prepareFileAttachments({
        ...request,
        currentFileEntryIds: [],
        historicalFileEntryIds: [FILE_ID],
        signal: controller.signal,
        readBytes: async () => {
          controller.abort(new Error('cancelled'));
          return new Uint8Array();
        },
      }),
    ).rejects.toThrow('cancelled');
  });
});

describe('AnyDoc attachment preparation', () => {
  const document = { ...text, mediaType: 'application/rtf', name: 'report.rtf' };
  const ir = {
    pages: [{ blocks: [{ runs: [{ text: '正文🍒', color: '#123456' }] }] }],
    unknownFutureField: [3, 1, null],
  };
  const png = (assetRef: string, size = 4) => ({
    assetRef,
    contentType: 'image/png',
    bytes: new ArrayBuffer(size),
  });

  beforeEach(() => {
    jest
      .mocked(parseAnydocDocument)
      .mockResolvedValue({ status: 'ok', ir, assets: [], warnings: ['original warning'] });
  });

  test('retains original IR fields and warnings instead of extracting or normalizing text', async () => {
    const result = await prepareFileAttachments({
      ...input([document]),
      documentParserMode: 'anydoc',
    });
    const content = result.get(FILE_ID)?.content;
    expect(content).toMatchObject({
      kind: 'document',
      parser: 'anydoc',
      document: {
        delivery: 'complete',
        result: { status: 'ok', ir, warnings: ['original warning'] },
      },
    });
    if (content?.kind !== 'document' || content.document.delivery !== 'complete')
      throw new Error('Expected full document');
    expect(content.document.result.ir).toBe(ir);
    expect(result.get(FILE_ID)?.report).toMatchObject({
      mode: 'document-ir',
      sourceTruncated: false,
      requestTruncated: false,
      delivery: 'complete',
    });
  });

  test('defers an oversized JSON object without sending a damaged prefix or dropping unknown fields', async () => {
    const largeIr = { longString: '中文🍒'.repeat(1_000) };
    jest
      .mocked(parseAnydocDocument)
      .mockResolvedValue({ status: 'ok', ir: largeIr, warnings: [], assets: [] });
    const result = await prepareFileAttachments({
      ...input([document]),
      documentParserMode: 'anydoc',
      limits: { maxBytesPerFile: 10, maxCharactersPerFile: 500, maxTotalCharacters: 500 },
    });
    expect(result.get(FILE_ID)?.content).toMatchObject({
      document: { delivery: 'deferred' },
      totalCharacters: [...JSON.stringify(largeIr)].length,
    });
    expect(result.get(FILE_ID)?.content).not.toHaveProperty('document.result');
    expect(result.get(FILE_ID)?.report).toMatchObject({
      delivery: 'deferred',
      requestTruncated: false,
    });
    expect(largeIr.longString).toBe('中文🍒'.repeat(1_000));
  });

  test('charges direct images and repeated current/historical document assets to one count ceiling', async () => {
    const assets = [png('first'), png('second')];
    jest.mocked(parseAnydocDocument).mockResolvedValue({ status: 'ok', ir, assets, warnings: [] });
    const request = input([document, { ...image, fileEntryId: SECOND_ID }]);
    const result = await prepareFileAttachments({
      ...request,
      documentParserMode: 'anydoc',
      historicalFileEntryIds: [FILE_ID, SECOND_ID],
      target: { ...request.target, maxImages: 4 },
    });
    expect(result.get(FILE_ID)?.content).toMatchObject({
      assets: [assets[0]],
      assetDelivery: [
        { assetRef: 'first', status: 'sent' },
        { assetRef: 'second', status: 'budget' },
      ],
    });
    expect(result.get(FILE_ID)?.report.images).toEqual({
      sent: 1,
      omitted: 1,
      omittedReasons: ['budget'],
    });
  });

  test.each([
    [false, 'image/png', 4, 'model-unsupported'],
    [true, 'image/tiff', 4, 'unsupported-type'],
    [true, 'image/png', MAX_IMAGE_ATTACHMENT_BYTES + 1, 'budget'],
  ])(
    'reports omitted pixels while retaining the IR: %s %s %s',
    async (acceptsImages, contentType, size, status) => {
      jest.mocked(parseAnydocDocument).mockResolvedValue({
        status: 'ok',
        ir,
        assets: [{ ...png('image-ref', size), contentType }],
        warnings: [],
      });
      const result = await prepareFileAttachments({
        ...input([document]),
        documentParserMode: 'anydoc',
        target: { purpose: 'chat', acceptsImages },
      });
      expect(result.get(FILE_ID)?.content).toMatchObject({
        assets: [],
        assetDelivery: [{ assetRef: 'image-ref', contentType, size, status }],
        document: { result: { ir } },
      });
    },
  );

  test('respects the combined image byte ceiling and model context reserve', async () => {
    const assets = [png('one', MAX_IMAGE_ATTACHMENT_BYTES), png('two', MAX_IMAGE_ATTACHMENT_BYTES)];
    jest.mocked(parseAnydocDocument).mockResolvedValue({ status: 'ok', ir, assets, warnings: [] });
    const request = input([
      document,
      { ...image, fileEntryId: SECOND_ID, size: MAX_IMAGE_ATTACHMENT_BYTES },
    ]);
    const result = await prepareFileAttachments({ ...request, documentParserMode: 'anydoc' });
    expect(result.get(FILE_ID)?.content).toMatchObject({
      assetDelivery: [{ status: 'sent' }, { status: 'budget' }],
    });
    const contextLimited = await prepareFileAttachments({
      ...input([document]),
      documentParserMode: 'anydoc',
      target: { purpose: 'chat', acceptsImages: true, maxInputTokens: 5_120 },
    });
    expect(contextLimited.get(FILE_ID)?.content).toMatchObject({
      assetDelivery: [{ status: 'sent' }, { status: 'budget' }],
    });
  });
});
