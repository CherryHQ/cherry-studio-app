import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

import { strFromU8, unzipSync } from 'fflate';

import { createOfficeCode } from '../createOfficeCode';
import { officeInputSchemas, type OfficeImage, type OfficeRequest } from '../officeSpec';
import docx from '../vendor/docx.json';
import pptxgenjs from '../vendor/pptxgenjs.json';
import xlsx from '../vendor/xlsx.json';

const IMAGE_ID = '00000000-0000-7000-8000-000000000001';
const IMAGE: OfficeImage = {
  mediaType: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBE8AAAAASUVORK5CYII=',
};

// This checks the adapter without DOM, Node modules, Buffer, or timers in its context. Device
// acceptance remains separate: node:vm does not prove QuickJS memory/time limits or native I/O.
async function render(request: OfficeRequest, images: Record<string, OfficeImage> = {}) {
  const result: unknown = await runInNewContext(
    `(async () => { ${createOfficeCode(request, images)} })()`,
    { queueMicrotask, atob, btoa },
    { timeout: 5000 },
  );
  expect(typeof result).toBe('string');
  return unzipSync(new Uint8Array(Buffer.from(result as string, 'base64')));
}

describe('Office generation contracts', () => {
  test.each([docx, pptxgenjs, xlsx])('pins the unmodified $name browser asset', (asset) => {
    expect(createHash('sha256').update(asset.code).digest('hex')).toBe(asset.sha256);
    expect(Object.values(asset.licenses).every((license) => license.length > 100)).toBe(true);
  });

  test('generates DOCX structure, escaped Unicode, lists, tables and embedded image relationships', async () => {
    const text = '中文 😀 & <tag>\nsecond line';
    const files = await render(
      {
        format: 'docx',
        filename: 'report.docx',
        spec: {
          version: 1,
          blocks: [
            { type: 'paragraph', text, style: 'heading1' },
            { type: 'list', ordered: true, items: ['First', 'Second'] },
            {
              type: 'table',
              header: true,
              rows: [
                ['Name', 'Value'],
                ['A', '1'],
              ],
            },
            { type: 'image', file_entry_id: IMAGE_ID, width_px: 100, height_px: 100 },
          ],
        },
      },
      { [IMAGE_ID]: IMAGE },
    );
    const xml = strFromU8(files['word/document.xml']);
    expect(xml).toContain('中文 😀 &amp; &lt;tag&gt;');
    expect(xml).toContain('second line');
    expect(xml).toContain('w:br');
    expect(xml).toContain('w:numPr');
    expect(xml).toContain('w:tbl');
    expect(xml).toContain('a:blip');
    expect(files['word/numbering.xml']).toBeDefined();
    expect(Object.keys(files).filter((path) => /^word\/media\/.+\.png$/.test(path))).toHaveLength(
      1,
    );
    expect(strFromU8(files['word/_rels/document.xml.rels'])).toContain('/image');
  });

  test('keeps spreadsheet formula-like strings literal and preserves scalar types', async () => {
    const files = await render({
      format: 'xlsx',
      filename: 'data.xlsx',
      spec: {
        version: 1,
        sheets: [
          {
            name: '数据',
            rows: [['=1+1', 12.5, true, null]],
            column_widths: [20, 12],
            column_formats: ['general', 'decimal'],
          },
        ],
      },
    });
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('=1+1');
    expect(sheet).not.toMatch(/<f[ >]/);
    expect(sheet).toContain('<v>12.5</v>');
    expect(sheet).toMatch(/r="C1"[^>]*t="b"/);
    expect(sheet).toContain('<cols>');
    expect(strFromU8(files['xl/workbook.xml'])).toContain('数据');
  });

  test('embeds editable workbook images at the requested cell with package relationships', async () => {
    const request: OfficeRequest = {
      format: 'xlsx',
      filename: 'images.xlsx',
      spec: {
        version: 1,
        sheets: [
          {
            name: 'Photos',
            rows: [['Photo']],
            images: [
              {
                file_entry_id: IMAGE_ID,
                cell: 'C4',
                width_px: 100,
                height_px: 60,
                alt: '中文 😀 & photo',
              },
            ],
          },
        ],
      },
    };
    const files = await render(request, { [IMAGE_ID]: IMAGE });
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('rIdCherryDrawing');
    expect(strFromU8(files['xl/worksheets/_rels/sheet1.xml.rels'])).toContain(
      '../drawings/drawing1.xml',
    );
    const drawing = strFromU8(files['xl/drawings/drawing1.xml']);
    expect(drawing).toContain('<xdr:col>2</xdr:col>');
    expect(drawing).toContain('<xdr:row>3</xdr:row>');
    expect(drawing).toContain('中文 😀 &amp; photo');
    expect(files['xl/media/image1.png']).toEqual(new Uint8Array(Buffer.from(IMAGE.data, 'base64')));
    expect(strFromU8(files['[Content_Types].xml'])).toContain('image/png');
  });

  test('creates editable PPTX text/table elements and embeds image bytes', async () => {
    const files = await render(
      {
        format: 'pptx',
        filename: 'deck.pptx',
        spec: {
          version: 1,
          slides: [
            { type: 'title', title: '中文 😀 <title>', subtitle: 'Summary' },
            { type: 'bullets', title: 'Agenda', items: ['One', 'Two'] },
            {
              type: 'table',
              title: 'Data',
              rows: [
                ['Name', 'Count'],
                ['A', '2'],
              ],
            },
            {
              type: 'image',
              title: 'Image',
              file_entry_id: IMAGE_ID,
              width_px: 100,
              height_px: 100,
            },
          ],
        },
      },
      { [IMAGE_ID]: IMAGE },
    );
    expect(strFromU8(files['ppt/slides/slide1.xml'])).toContain('中文 😀 &lt;title&gt;');
    expect(strFromU8(files['ppt/slides/slide2.xml'])).toContain('<a:t>One</a:t>');
    expect(strFromU8(files['ppt/slides/slide3.xml'])).toContain('<a:tbl>');
    expect(strFromU8(files['ppt/slides/slide4.xml'])).toContain('<p:pic>');
    expect(
      Object.keys(files).some((path) => path.startsWith('ppt/media/') && files[path].length > 0),
    ).toBe(true);
  });

  test('rejects unknown fields, invalid XML, duplicate sheets and ragged tables', () => {
    const document = {
      filename: 'doc.docx',
      spec: { version: 1, blocks: [{ type: 'paragraph', text: 'ok 😀' }] },
    };
    expect(officeInputSchemas.docx.safeParse(document).success).toBe(true);
    expect(officeInputSchemas.docx.safeParse({ ...document, path: '/private' }).success).toBe(
      false,
    );
    for (const text of ['\0', '\ud800']) {
      expect(
        officeInputSchemas.docx.safeParse({
          ...document,
          spec: { version: 1, blocks: [{ type: 'paragraph', text }] },
        }).success,
      ).toBe(false);
    }
    expect(
      officeInputSchemas.xlsx.safeParse({
        filename: 'book.xlsx',
        spec: {
          version: 1,
          sheets: [
            { name: 'Data', rows: [[1]] },
            { name: 'data', rows: [[2]] },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      officeInputSchemas.xlsx.safeParse({
        filename: 'book.xlsx',
        spec: { version: 1, sheets: [{ name: 'Data', rows: [[1, 2], [3]] }] },
      }).success,
    ).toBe(false);
  });
});
