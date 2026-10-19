import { runInNewContext } from 'node:vm';

import { strFromU8, unzipSync } from 'fflate';

import type { OfficeFormat } from '../officeSpec';
import { createOfficeScriptCode, type OfficeScriptInput } from '../runOfficeScript';

const IMAGE_ID = '00000000-0000-7000-8000-000000000001';
const SOURCE_ID = '00000000-0000-7000-8000-000000000002';
const IMAGE: OfficeScriptInput = {
  name: 'dot.png',
  mediaType: 'image/png',
  data: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBE8AAAAASUVORK5CYII=',
    'base64',
  ),
};

// node:vm checks the script contract without DOM, Node modules, Buffer or timers in its context;
// QuickJS limits and native I/O remain device acceptance.
async function run(
  format: OfficeFormat,
  script: string,
  inputs: Record<string, OfficeScriptInput> = {},
): Promise<Uint8Array> {
  const result: unknown = await runInNewContext(
    `(async () => { ${createOfficeScriptCode(format, script, inputs)} })()`,
    { queueMicrotask, atob, btoa },
    { timeout: 10_000 },
  );
  expect(typeof result).toBe('string');
  return new Uint8Array(Buffer.from(result as string, 'base64'));
}

describe('Office scripts', () => {
  test('builds a DOCX through the docx library with an input image', async () => {
    const files = unzipSync(
      await run(
        'docx',
        `const { Document, Paragraph, TextRun, ImageRun, HeadingLevel, Packer } = docx;
        const doc = new Document({ sections: [{ children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '标题', color: 'C00000', size: 40 })] }),
          new Paragraph({ children: [new ImageRun({ type: 'png', data: inputs['${IMAGE_ID}'].bytes, transformation: { width: 40, height: 40 } })] }),
        ] }] });
        return Packer.toBase64String(doc);`,
        { [IMAGE_ID]: IMAGE },
      ),
    );
    const xml = strFromU8(files['word/document.xml']);
    expect(xml).toContain('标题');
    expect(xml).toContain('C00000');
    expect(Object.keys(files).some((path) => path.startsWith('word/media/'))).toBe(true);
  });

  test('lays out several images freely with PptxGenJS', async () => {
    const files = unzipSync(
      await run(
        'pptx',
        `const pres = new PptxGenJS();
        const slide = pres.addSlide();
        slide.addText('Gallery', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28 });
        for (let i = 0; i < 3; i++) slide.addImage({ data: 'data:image/png;base64,' + inputs['${IMAGE_ID}'].base64, x: 0.5 + i * 3, y: 1.5, w: 2.5, h: 2.5 });
        return pres.write({ outputType: 'base64' });`,
        { [IMAGE_ID]: IMAGE },
      ),
    );
    expect(strFromU8(files['ppt/slides/slide1.xml']).match(/<p:pic>/g)).toHaveLength(3);
  });

  test('writes SheetJS formulas', async () => {
    const files = unzipSync(
      await run(
        'xlsx',
        `const sheet = XLSX.utils.aoa_to_sheet([[1], [2]]);
        sheet.A3 = { t: 'n', f: 'SUM(A1:A2)' };
        sheet['!ref'] = 'A1:A3';
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, 'Data');
        return XLSX.write(book, { bookType: 'xlsx', type: 'base64' });`,
      ),
    );
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('<f>SUM(A1:A2)</f>');
  });

  test('patches an existing DOCX and edits package XML while keeping other parts', async () => {
    const template = await run(
      'docx',
      `const { Document, Paragraph, ImageRun, Packer } = docx;
      return Packer.toBase64String(new Document({ sections: [{ children: [
        new Paragraph('Dear {{name}},'),
        new Paragraph({ children: [new ImageRun({ type: 'png', data: inputs['${IMAGE_ID}'].bytes, transformation: { width: 10, height: 10 } })] }),
      ] }] }));`,
      { [IMAGE_ID]: IMAGE },
    );
    const source = { name: 'letter.docx', mediaType: 'application/octet-stream', data: template };

    const patched = unzipSync(
      await run(
        'docx',
        `return docx.patchDocument({ outputType: 'uint8array', data: inputs['${SOURCE_ID}'].bytes,
          patches: { name: { type: docx.PatchType.PARAGRAPH, children: [new docx.TextRun('Ada')] } } });`,
        { [SOURCE_ID]: source },
      ),
    );
    expect(strFromU8(patched['word/document.xml'])).toContain('Ada');

    const edited = unzipSync(
      await run(
        'docx',
        `const parts = zip.unzipSync(inputs['${SOURCE_ID}'].bytes);
        const doc = new xml.DOMParser().parseFromString(zip.strFromU8(parts['word/document.xml']), 'application/xml');
        const text = doc.getElementsByTagName('w:t')[0];
        text.textContent = text.textContent.replace('{{name}}', 'Grace');
        parts['word/document.xml'] = zip.strToU8(new xml.XMLSerializer().serializeToString(doc));
        return zip.zipSync(parts);`,
        { [SOURCE_ID]: source },
      ),
    );
    expect(strFromU8(edited['word/document.xml'])).toContain('Dear Grace,');
    expect(Object.keys(edited).some((path) => path.startsWith('word/media/'))).toBe(true);
  });

  test.each([
    ['return 42;', 'Return the DOCX file as a base64 string'],
    ['return zip.zipSync({ a: zip.strToU8("x") });', 'word/document.xml is missing'],
    ['return new Uint8Array([1, 2, 3]);', 'not a ZIP package'],
  ])('refuses an invalid result from %s', async (script, message) => {
    await expect(run('docx', script)).rejects.toThrow(message);
  });
});
