import { createHash } from 'node:crypto';

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { createOfficeCode } from '../createOfficeCode';
import {
  officeEditSchemas,
  officeInspectSchema,
  officeReadSchema,
  type OfficeTransformRequest,
} from '../officeEditSpec';
import { createOfficeTransformCode } from '../transformOfficeFile';
import fflate from '../vendor/fflate.json';
import xmldom from '../vendor/xmldom.json';
import { runOfficeJob, runOfficeJobSync } from './_officeJob';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const ID = '00000000-0000-7000-8000-000000000001';
const SOURCE = {
  version: 1 as const,
  file_entry_id: ID,
  source_sha256: 'a'.repeat(64),
  filename: 'copy.docx',
};

function archive(parts: Record<string, string | Uint8Array>) {
  return zipSync(
    Object.fromEntries(
      Object.entries(parts).map(([path, data]) => [
        path,
        typeof data === 'string' ? strToU8(data) : data,
      ]),
    ),
  );
}

// The same trusted job text, without DOM, filesystem or Node globals in its context.
// This fixture cannot establish native QuickJS compatibility or Office visual fidelity.
function operate(parts: Record<string, string | Uint8Array>, request: OfficeTransformRequest) {
  const { value, output } = runOfficeJobSync(createOfficeTransformCode(request), [archive(parts)]);
  return {
    ...(value as { error?: string; size?: number; text?: string; items?: unknown[] }),
    output,
  };
}

function editedParts(result: ReturnType<typeof operate>) {
  expect(result.error).toBeUndefined();
  expect(result.size).toBe(result.output?.length);
  return unzipSync(result.output!);
}

const word = (paragraph: string) =>
  `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body>${paragraph}</w:body></w:document>`;
const docxEdit = (expectText = 'Hello world 😀'): OfficeTransformRequest => ({
  ...SOURCE,
  operation: 'edit',
  format: 'docx',
  edits: [
    {
      anchor: { format: 'docx', paragraph: 0, paraId: '1234ABCD' },
      expect_text: expectText,
      find: 'lo wor',
      replace: 'p the',
    },
  ],
});

test('retains untouched DOCX bytes and edits text across runs without flattening styles or hyperlinks', () => {
  const media = new Uint8Array([0, 1, 2, 255]);
  const source = {
    'word/document.xml': word(
      '<w:p w14:paraId="1234ABCD"><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Hello </w:t></w:r><w:hyperlink r:id="rIdLink"><w:r><w:rPr><w:i/></w:rPr><w:t>world 😀</w:t></w:r></w:hyperlink></w:p>',
    ),
    'word/media/picture.png': media,
    'customXml/item1.xml': '<original untouched="yes"/>',
  };
  const output = editedParts(operate(source, docxEdit()));
  const xml = strFromU8(output['word/document.xml']);
  expect(xml).toContain('Help the');
  expect(xml).toContain('ld 😀');
  expect(xml).toContain('w:b');
  expect(xml).toContain('w:i');
  expect(xml).toContain('r:id="rIdLink"');
  expect(output['word/media/picture.png']).toEqual(media);
  expect(strFromU8(output['customXml/item1.xml'])).toBe(source['customXml/item1.xml']);
  expect(source['word/document.xml']).toContain('Hello ');
});

test('refuses stale paragraph text, conflicting paraId and protected paragraph structures', () => {
  const plain = '<w:p w14:paraId="1234ABCD"><w:r><w:t>Hello world 😀</w:t></w:r></w:p>';
  expect(operate({ 'word/document.xml': word(plain) }, docxEdit('old text')).error).toMatch(
    /changed/,
  );
  expect(
    operate({ 'word/document.xml': word(plain.replace('1234ABCD', 'FFFFFFFF')) }, docxEdit()).error,
  ).toMatch(/disagree/);
  for (const content of [
    '<w:bookmarkStart w:id="1" w:name="a"/>',
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
    '<w:ins><w:r><w:t>tracked</w:t></w:r></w:ins>',
  ]) {
    const xml = word(plain.replace('</w:p>', content + '</w:p>'));
    expect(operate({ 'word/document.xml': xml }, docxEdit()).error).toBeDefined();
  }
});

test('uses the preview UTF-16 character range without replacing another identical occurrence', () => {
  const source = { 'word/document.xml': word('<w:p><w:r><w:t>😀 one one</w:t></w:r></w:p>') };
  const anchor = { format: 'docx' as const, paragraph: 0, charRange: [7, 10] as [number, number] };
  const output = editedParts(
    operate(source, {
      ...SOURCE,
      operation: 'edit',
      format: 'docx',
      edits: [{ anchor, expect_text: '😀 one one', find: 'one', replace: 'two' }],
    }),
  );
  expect(strFromU8(output['word/document.xml'])).toContain('😀 one two');
});

function workbook(sheet: string) {
  return {
    'xl/workbook.xml': `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Data" sheetId="1" r:id="sheetRel"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="sheetRel" Type="${R}/worksheet" Target="worksheets/data.xml"/><Relationship Id="chain" Type="${R}/calcChain" Target="calcChain.xml"/></Relationships>`,
    'xl/worksheets/data.xml': `<worksheet xmlns="${S}">${sheet}</worksheet>`,
    'xl/calcChain.xml': `<calcChain xmlns="${S}"><c r="A1" i="1"/></calcChain>`,
    '[Content_Types].xml': `<Types xmlns="${CT}"><Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>`,
    'xl/drawings/drawing1.xml': '<preserved-chart-and-image/>',
  };
}
const workbookEdit = (address = 'A1'): OfficeTransformRequest => ({
  ...SOURCE,
  filename: 'copy.xlsx',
  operation: 'edit',
  format: 'xlsx',
  sheet: 'Data',
  cells: [{ address, value: '=literal' }],
});

test('edits generated XLSX files with an unused macro content-type default', async () => {
  const { output: generated } = await runOfficeJob(
    createOfficeCode(
      {
        format: 'xlsx',
        filename: 'generated.xlsx',
        spec: { version: 1, sheets: [{ name: 'Data', rows: [['Keep 🍒', 3, true]] }] },
      },
      {},
    ),
  );
  const source = unzipSync(generated!);
  expect(strFromU8(source['[Content_Types].xml'])).toContain('macroEnabled');
  expect(Object.keys(source).some((path) => path.endsWith('.bin'))).toBe(false);
  const output = editedParts(operate(source, workbookEdit('B1')));
  const sheet = strFromU8(output['xl/worksheets/sheet1.xml']);
  expect(sheet).toContain('=literal');
  expect(sheet).toContain('Keep 🍒');
  expect(output['[Content_Types].xml']).toEqual(source['[Content_Types].xml']);
});

test.each(['vba-part', 'macro-override', 'used-macro-default'])(
  'still rejects an XLSX edit with %s',
  (kind) => {
    const source: Record<string, string | Uint8Array> = workbook('<sheetData/>');
    if (kind === 'vba-part') source['xl/vbaProject.bin'] = new Uint8Array([1]);
    if (kind === 'macro-override') {
      source['[Content_Types].xml'] =
        `<Types xmlns="${CT}"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>`;
    }
    if (kind === 'used-macro-default') {
      source['xl/macro.bin'] = new Uint8Array([1]);
      source['[Content_Types].xml'] =
        `<Types xmlns="${CT}"><Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>`;
    }
    expect(operate(source, workbookEdit()).error).toMatch(/Macro-enabled/);
  },
);

test('patches XLSX cells, retains drawing bytes and removes invalidated calculation bookkeeping', () => {
  const source = workbook(
    '<dimension ref="A1"/><sheetData><row r="1"><c r="A1" s="4"><f>1+1</f><v>2</v></c><c r="B1"><f>A1*2</f><v>4</v></c></row></sheetData>',
  );
  const output = editedParts(operate(source, workbookEdit()));
  const sheet = strFromU8(output['xl/worksheets/data.xml']);
  expect(sheet).toContain('s="4"');
  expect(sheet).toContain('t="inlineStr"');
  expect(sheet).toContain('=literal');
  expect(sheet).toContain('<f>A1*2</f>');
  expect(output['xl/calcChain.xml']).toBeUndefined();
  expect(strFromU8(output['xl/_rels/workbook.xml.rels'])).not.toContain('/calcChain');
  expect(strFromU8(output['[Content_Types].xml'])).not.toContain('/xl/calcChain.xml');
  expect(strFromU8(output['xl/workbook.xml'])).toContain('fullCalcOnLoad="1"');
  expect(strFromU8(output['xl/drawings/drawing1.xml'])).toBe(source['xl/drawings/drawing1.xml']);
});

test.each(['shared', 'array', 'dataTable'])(
  'refuses %s formula members even when the target has no formula element',
  (type) => {
    const source = workbook(
      `<sheetData><row r="1"><c r="A1"><f t="${type}" ref="A1:B2">1</f><v>1</v></c></row></sheetData>`,
    );
    expect(operate(source, workbookEdit('B2')).error).toMatch(/formula groups/);
  },
);

test('refuses merged followers and out-of-grid cells', () => {
  const source = workbook('<sheetData/><mergeCells><mergeCell ref="A1:B2"/></mergeCells>');
  expect(operate(source, workbookEdit('B2')).error).toMatch(/top-left/);
  expect(operate(source, workbookEdit('XFE1')).error).toMatch(/outside/);
});

test('resolves PPTX slide order through relationships and edits a grouped shape by OOXML id', () => {
  const parts = {
    'ppt/presentation.xml': `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="second"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="second" Type="${R}/slide" Target="slides/slide7.xml"/></Relationships>`,
    'ppt/slides/slide7.xml': `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:grpSp><p:sp><p:nvSpPr><p:cNvPr id="42" name="Text"/></p:nvSpPr><p:txBody><a:p><a:r><a:rPr b="1"/><a:t>Hello </a:t></a:r><a:r><a:rPr i="1"/><a:t>world</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp></p:spTree></p:cSld></p:sld>`,
    'ppt/slideMasters/slideMaster1.xml': '<unchanged-master/>',
  };
  const anchor = { format: 'pptx' as const, slide: 1, nodeId: '42', paragraph: 0 };
  expect(operate(parts, { operation: 'read', file_entry_id: ID, anchor }).text).toBe('Hello world');
  const output = editedParts(
    operate(parts, {
      ...SOURCE,
      operation: 'edit',
      format: 'pptx',
      edits: [{ anchor, expect_text: 'Hello world', find: 'lo wor', replace: 'p the' }],
    }),
  );
  expect(strFromU8(output['ppt/slides/slide7.xml'])).toContain('Help the');
  expect(strFromU8(output['ppt/slides/slide7.xml'])).toContain('i="1"');
  expect(strFromU8(output['ppt/slideMasters/slideMaster1.xml'])).toBe(
    parts['ppt/slideMasters/slideMaster1.xml'],
  );
});

test('rejects DTDs, including UTF-16 input, and signed package edits', () => {
  const text = `<!DOCTYPE document [<!ENTITY x "bad">]>${word('<w:p/>')}`;
  const utf16 = new Uint8Array(
    Buffer.concat([Buffer.from([255, 254]), Buffer.from(text, 'utf16le')]),
  );
  const request: OfficeTransformRequest = {
    operation: 'inspect',
    format: 'docx',
    offset: 0,
    limit: 10,
    shape_offset: 0,
  };
  expect(operate({ 'word/document.xml': utf16 }, request).error).toMatch(/DOCTYPE/);
  expect(
    operate(
      { 'word/document.xml': word('<w:p/>'), '_xmlsignatures/sig1.xml': '<signature/>' },
      docxEdit(),
    ).error,
  ).toMatch(/Signed/);
});

test('validates serialized edit preconditions and input limits', () => {
  expect(officeInspectSchema.parse({ file_entry_id: ID }).limit).toBe(30);
  expect(
    officeReadSchema.safeParse({ file_entry_id: ID, anchor: { format: 'docx', paragraph: -1 } })
      .success,
  ).toBe(false);
  const edit = {
    ...SOURCE,
    edits: [
      { anchor: { format: 'docx', paragraph: 0 }, expect_text: 'old', find: 'old', replace: 'new' },
    ],
  };
  expect(officeEditSchemas.docx.safeParse(edit).success).toBe(true);
  expect(officeEditSchemas.docx.safeParse({ ...edit, source_sha256: undefined }).success).toBe(
    false,
  );
  expect(officeEditSchemas.docx.safeParse({ ...edit, overwrite: true }).success).toBe(false);
  for (const text of ['a\tb', 'a\nb', 'a\rb', 'a\u0001b', 'a\ufffeb'])
    for (const field of ['find', 'replace'])
      expect(
        officeEditSchemas.docx.safeParse({ ...edit, edits: [{ ...edit.edits[0], [field]: text }] })
          .success,
      ).toBe(false);
});

test.each([fflate, xmldom])('retains source hashes and licenses for $name', (vendor) => {
  for (const asset of Object.values(vendor.assets))
    expect(createHash('sha256').update(asset.code).digest('hex')).toBe(asset.sha256);
  expect(vendor.license.length).toBeGreaterThan(100);
});
