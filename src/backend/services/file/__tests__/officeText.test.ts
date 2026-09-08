import { utils, write } from '@e965/xlsx';
import { strToU8, Unzip, unzipSync, Zip, ZipDeflate, zipSync } from 'fflate/browser';

import { extractOfficeText } from '../officeText';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

describe('Office text extraction', () => {
  test('reads Unicode Word paragraphs, run boundaries, breaks, table cells, and footnotes', () => {
    const bytes = officeZip({
      'word/document.xml': `<w:document xmlns:w="${WORD_NS}"><w:body>
        <w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:t>中文 &amp; 🍒</w:t><w:tab/><w:t>next</w:t><w:br/><w:t>line</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Revenue</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>12.5</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        </w:body></w:document>`,
      'word/footnotes.xml': `<w:footnotes xmlns:w="${WORD_NS}"><w:footnote><w:p><w:r><w:t>Source note</w:t></w:r></w:p></w:footnote></w:footnotes>`,
    });

    expect(extractOfficeText(bytes, 'docx')).toEqual({
      text: 'Hello 中文 & 🍒\tnext\nline\nRevenue\n12.5\nSource note',
      truncated: false,
    });
  });

  test('follows presentation relationships in slide order and includes speaker notes', () => {
    const slide = (text: string) =>
      `<p:sld xmlns:p="urn:p" xmlns:a="${DRAWING_NS}"><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`;
    const bytes = officeZip({
      'ppt/presentation.xml': `<p:presentation xmlns:p="urn:p" xmlns:r="${REL_NS}"><p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>`,
      'ppt/_rels/presentation.xml.rels':
        '<Relationships><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide12.xml"/></Relationships>',
      'ppt/slides/slide1.xml': slide('Last slide'),
      'ppt/slides/slide12.xml': slide('First slide'),
      'ppt/slides/_rels/slide12.xml.rels':
        '<Relationships><Relationship Id="notes" Type="urn:office/notesSlide" Target="../notesSlides/notesSlide4.xml"/></Relationships>',
      'ppt/notesSlides/notesSlide4.xml': slide('Speaker detail'),
    });

    expect(extractOfficeText(bytes, 'pptx')).toEqual({
      text: 'Slide 1\nFirst slide\nNotes\nSpeaker detail\nSlide 2\nLast slide',
      truncated: false,
    });
  });

  test('does not treat notes-page layout fields as text in an image-only presentation', () => {
    expect(extractOfficeText(presentationWithNotes('', ''), 'pptx')).toEqual({
      text: '',
      truncated: false,
    });
  });

  test.each(['Speaker detail', '1'])(
    'keeps actual speaker notes %s while excluding notes-page layout fields',
    (notes) => {
      expect(extractOfficeText(presentationWithNotes('', notes), 'pptx')).toEqual({
        text: `Slide 1\n\nNotes\n${notes}`,
        truncated: false,
      });
    },
  );

  test('does not add an empty notes heading to a readable slide', () => {
    expect(extractOfficeText(presentationWithNotes('Slide body', ''), 'pptx')).toEqual({
      text: 'Slide 1\nSlide body',
      truncated: false,
    });
  });

  test('preserves worksheet names, sparse cell coordinates, display formatting, and cached formulas', () => {
    const workbook = utils.book_new();
    const sheet = utils.aoa_to_sheet([['Sales', 12.5], [], ['Total']]);
    sheet.B1!.z = '0.00';
    sheet.B3 = { t: 'n', v: 25, f: 'B1*2' };
    sheet['!ref'] = 'A1:B3';
    utils.book_append_sheet(workbook, sheet, '季度汇总');
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([['Second sheet']]), 'Notes');

    const result = extractOfficeText(
      new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' })),
      'xlsx',
    );
    expect(result.truncated).toBe(false);
    expect(result.text).toContain('Sheet: 季度汇总\nA1: Sales\nB1: 12.50');
    expect(result.text).toContain('B3: 25 [=B1*2]');
    expect(result.text).toContain('Sheet: Notes\nA1: Second sheet');
  });

  test('flags spreadsheet row truncation without suppressing the extracted rows', () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(
      workbook,
      {
        A1: { t: 's', v: 'Included' },
        A10001: { t: 's', v: 'Outside limit' },
        '!ref': 'A1:A10001',
      },
      'Large',
    );
    const result = extractOfficeText(
      new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' })),
      'xlsx',
    );
    expect(result).toEqual({ text: 'Sheet: Large\nA1: Included', truncated: true });
  });

  test('rejects a forged XLSX local size before the workbook parser can allocate from it', () => {
    const bytes = workbookBytes();
    const headers = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    headers.setUint32(22, 512 * 1024 * 1024, true);
    const xlsx = jest.requireActual<typeof import('@e965/xlsx')>('@e965/xlsx');
    const read = jest.spyOn(xlsx, 'read').mockReturnValue({ SheetNames: [], Sheets: {} });
    try {
      expect(() => extractOfficeText(bytes, 'xlsx')).toThrow(
        'Office archive entry does not match its directory.',
      );
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  test.each([false, true])(
    'rejects understated XLSX output sizes (compressed: %s)',
    (compression) => {
      const bytes = workbookBytes(compression);
      const headers = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const directoryOffset = headers.getUint32(bytes.length - 22 + 16, true);
      headers.setUint32(22, 1, true);
      headers.setUint32(directoryOffset + 24, 1, true);

      expect(() => extractOfficeText(bytes, 'xlsx')).toThrow(
        'Office archive entry exceeds its declared size.',
      );
    },
  );

  test('reads XLSX data descriptors while keeping only stored XML in the parser input', () => {
    const parts = unzipSync(workbookBytes());
    parts['xl/media/image1.png'] = new Uint8Array([137, 80, 78, 71]);
    const chunks: Uint8Array[] = [];
    const zip = new Zip((error, chunk) => {
      if (error) throw error;
      chunks.push(chunk);
    });
    for (const [name, bytes] of Object.entries(parts)) {
      const entry = new ZipDeflate(name);
      zip.add(entry);
      entry.push(bytes, true);
    }
    zip.end();
    const bytes = joinBytes(chunks);
    const xlsx = jest.requireActual<typeof import('@e965/xlsx')>('@e965/xlsx');
    const readWorkbook = xlsx.read;
    const read = jest.spyOn(xlsx, 'read').mockImplementation((input, options) => {
      expect(input).toBeInstanceOf(Uint8Array);
      const entries: string[] = [];
      const unzip = new Unzip((file) => {
        expect(file.compression).toBe(0);
        expect(file.name.endsWith('.xml') || file.name.endsWith('.rels')).toBe(true);
        entries.push(file.name);
      });
      unzip.push(input, true);
      expect(entries).not.toContain('xl/media/image1.png');
      return readWorkbook(input, options);
    });
    try {
      expect(extractOfficeText(bytes, 'xlsx')).toEqual({
        text: 'Sheet: Notes\nA1: Workbook body',
        truncated: false,
      });
      expect(read).toHaveBeenCalledTimes(1);
    } finally {
      read.mockRestore();
    }
  });

  test('returns no text for image-only documents', () => {
    expect(
      extractOfficeText(
        officeZip({
          'word/document.xml': `<w:document xmlns:w="${WORD_NS}"><w:body><w:p><w:r><w:drawing/></w:r></w:p></w:body></w:document>`,
        }),
        'docx',
      ),
    ).toEqual({ text: '', truncated: false });
  });

  test.each([
    '<!DOCTYPE x [<!ENTITY injected "unsafe">]><x>&injected;</x>',
    '<w:document xmlns:w="urn:w"><w:p></w:document>',
  ])('rejects unsupported or malformed XML instead of sending partial content', (xml) => {
    expect(() => extractOfficeText(officeZip({ 'word/document.xml': xml }), 'docx')).toThrow();
  });

  test('rejects non-Office archives and oversized expanded XML', () => {
    expect(() => extractOfficeText(zipSync({ 'data.txt': strToU8('text') }), 'docx')).toThrow();
    expect(() =>
      extractOfficeText(
        officeZip({ 'word/document.xml': 'x'.repeat(4 * 1024 * 1024 + 1) }),
        'docx',
      ),
    ).toThrow('size limit');
  });
});

function officeZip(entries: Record<string, string>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries({
        '[Content_Types].xml': '<Types/>',
        ...entries,
      }).map(([name, value]) => [name, strToU8(value)]),
    ),
  );
}

function workbookBytes(compression = true): Uint8Array {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([['Workbook body']]), 'Notes');
  return new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx', compression }));
}

function joinBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function presentationWithNotes(slideText: string, notesText: string): Uint8Array {
  const shape = (type: string, text: string) => `<p:sp>
    <p:nvSpPr><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr>
    <p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody>
    </p:sp>`;
  return officeZip({
    'ppt/presentation.xml': `<p:presentation xmlns:p="urn:p" xmlns:r="${REL_NS}"><p:sldIdLst><p:sldId r:id="slide"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels':
      '<Relationships><Relationship Id="slide" Target="slides/slide1.xml"/></Relationships>',
    'ppt/slides/slide1.xml': `<p:sld xmlns:p="urn:p" xmlns:a="${DRAWING_NS}"><p:cSld><p:spTree><p:pic/>${shape('body', slideText)}</p:spTree></p:cSld></p:sld>`,
    'ppt/slides/_rels/slide1.xml.rels':
      '<Relationships><Relationship Id="notes" Type="urn:office/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
    'ppt/notesSlides/notesSlide1.xml': `<p:notes xmlns:p="urn:p" xmlns:a="${DRAWING_NS}"><p:cSld><p:spTree>
      ${shape('body', notesText)}
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:fld type="slidenum"><a:t>1</a:t></a:fld></a:p></p:txBody></p:sp>
      ${shape('dt', '2026-09-07')}${shape('hdr', 'Header')}${shape('ftr', 'Footer')}${shape('sldImg', 'Slide preview')}
      </p:spTree></p:cSld></p:notes>`,
  });
}
