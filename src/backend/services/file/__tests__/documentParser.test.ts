import { resolveDocumentImportMediaType } from '@/shared/utils/documentFileTypes';
import { MAX_DOCUMENT_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import { parseAnydocDocument } from '../anydocParser';
import { readAttachmentContent } from '../readAttachmentContent';

jest.mock('../anydocParser', () => ({
  ANYDOC_PARSER_VERSION: '0.4.1',
  parseAnydocDocument: jest.fn(),
}));

const file = (name: string) => ({
  fileEntryId: '00000000-0000-7000-8000-000000000001',
  name,
  mediaType: resolveDocumentImportMediaType(name),
  size: 5,
});
const reader = () => ({
  readBytes: jest.fn(async () => new Uint8Array([1, 2, 3])),
  readDocumentText: jest.fn(async () => ({ text: 'A1: 2 [=1+1]', truncated: false })),
});
const signal = () => new AbortController().signal;

beforeEach(() => jest.clearAllMocks());

describe('shared document parser selection', () => {
  test.each(['docx', 'pptx', 'xlsx', 'doc', 'ppt', 'xls', 'odt', 'ods', 'odp', 'rtf', 'epub'])(
    'passes %s to AnyDoc and retains the exact public output',
    async (extension) => {
      const output = {
        status: 'ok' as const,
        ir: { unknown: [false, 0, '🍒'], styles: { font: 'Original font' } },
        warnings: ['warning'],
        assets: [{ assetRef: 'original-ref', contentType: null, bytes: new ArrayBuffer(4) }],
      };
      jest.mocked(parseAnydocDocument).mockResolvedValue(output);
      const port = reader();
      const result = await readAttachmentContent(
        file(`file.${extension}`),
        port,
        signal(),
        undefined,
        'anydoc',
      );
      expect(result).toMatchObject({ kind: 'document', parsed: { parser: 'anydoc', output } });
      if (result.kind !== 'document') throw new Error('Expected document');
      expect(result.parsed.output).toBe(output);
      expect(port.readDocumentText).not.toHaveBeenCalled();
    },
  );

  test('keeps PDF native and built-in Office text without loading the native AnyDoc module', async () => {
    for (const mode of ['anydoc', 'builtin'] as const) {
      expect(
        await readAttachmentContent(file('file.pdf'), reader(), signal(), undefined, mode),
      ).toMatchObject({ kind: 'text', parser: 'native-pdf' });
    }
    expect(
      await readAttachmentContent(file('file.xlsx'), reader(), signal(), undefined, 'builtin'),
    ).toMatchObject({ kind: 'text', parser: 'builtin', text: 'A1: 2 [=1+1]' });
    expect(parseAnydocDocument).not.toHaveBeenCalled();
  });

  test.each(['doc', 'ppt', 'xls', 'odt', 'ods', 'odp', 'rtf', 'epub'])(
    'rejects %s in built-in mode before parsing',
    async (extension) => {
      const port = reader();
      await expect(
        readAttachmentContent(file(`file.${extension}`), port, signal(), undefined, 'builtin'),
      ).rejects.toMatchObject({ issue: { code: 'parser-unsupported' } });
      expect(port.readBytes).not.toHaveBeenCalled();
      expect(port.readDocumentText).not.toHaveBeenCalled();
    },
  );

  test('preserves the original failure without a second-engine fallback', async () => {
    const failure = { status: 'fallback' as const, reason: 'encrypted', detail: 'original detail' };
    jest.mocked(parseAnydocDocument).mockResolvedValue(failure);
    const port = reader();
    await expect(
      readAttachmentContent(file('file.docx'), port, signal(), undefined, 'anydoc'),
    ).rejects.toMatchObject({
      issue: { code: 'document-invalid' },
      cause: { parser: 'anydoc', parserVersion: '0.4.1', output: failure },
    });
    expect(port.readDocumentText).not.toHaveBeenCalled();
  });

  test('rejects invalid JSON values but accepts an image-only successful document', async () => {
    jest.mocked(parseAnydocDocument).mockResolvedValueOnce({
      status: 'ok',
      ir: { invalid: undefined },
      warnings: [],
      assets: [],
    });
    await expect(
      readAttachmentContent(file('file.docx'), reader(), signal(), undefined, 'anydoc'),
    ).rejects.toMatchObject({ issue: { code: 'document-invalid' } });
    jest.mocked(parseAnydocDocument).mockResolvedValueOnce({
      status: 'ok',
      ir: { pages: [{ images: [{ assetRef: 'ref' }] }] },
      warnings: [],
      assets: [],
    });
    await expect(
      readAttachmentContent(file('file.docx'), reader(), signal(), undefined, 'anydoc'),
    ).resolves.toMatchObject({ kind: 'document' });
  });

  test('checks actual bytes before native conversion and discards a late cancelled result', async () => {
    await expect(
      readAttachmentContent(
        file('file.docx'),
        { ...reader(), readBytes: async () => new Uint8Array(MAX_DOCUMENT_ATTACHMENT_BYTES + 1) },
        signal(),
        undefined,
        'anydoc',
      ),
    ).rejects.toMatchObject({ issue: { code: 'file-bytes' } });
    expect(parseAnydocDocument).not.toHaveBeenCalled();
    const controller = new AbortController();
    jest.mocked(parseAnydocDocument).mockImplementationOnce(async () => {
      controller.abort(new Error('cancelled'));
      return { status: 'ok', ir: { late: 'result' }, assets: [], warnings: [] };
    });
    await expect(
      readAttachmentContent(file('file.docx'), reader(), controller.signal, undefined, 'anydoc'),
    ).rejects.toThrow('cancelled');
  });

  test('classifies native module failure without leaking private paths', async () => {
    jest.mocked(parseAnydocDocument).mockRejectedValue(new Error('file:///private/path'));
    await expect(
      readAttachmentContent(file('file.docx'), reader(), signal(), undefined, 'anydoc'),
    ).rejects.toMatchObject({ issue: { code: 'parser-unavailable' } });
  });
});
