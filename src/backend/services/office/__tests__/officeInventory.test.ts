import { strToU8, zipSync } from 'fflate';

import type { OfficeTransformRequest } from '../officeEditSpec';
import type { OfficeFormat } from '../officeSpec';
import { createOfficeTransformCode } from '../transformOfficeFile';
import { runOfficeJobSync } from './_officeJob';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

function inspect(format: OfficeFormat, parts: Record<string, string>, options = {}) {
  const bytes = zipSync(
    Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, strToU8(value)])),
  );
  const request: OfficeTransformRequest = {
    operation: 'inspect',
    format,
    kind: 'structure',
    offset: 0,
    limit: 30,
    shape_offset: 0,
    finding_offset: 0,
    ...options,
  };
  return runOfficeJobSync(createOfficeTransformCode(request), [bytes]).value;
}

test('reads body tables, header, comments, revisions and fields without claiming they are editable paragraphs', () => {
  const result = inspect('docx', {
    'word/document.xml': `<w:document xmlns:w="${W}"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Title</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:ins w:id="5" w:author="Ada"><w:r><w:t>Added</w:t></w:r></w:ins><w:del w:id="6"><w:r><w:delText>Removed</w:delText></w:r></w:del><w:fldSimple w:instr="PAGE"/></w:p></w:body></w:document>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="header" Type="${R}/header" Target="header1.xml"/><Relationship Id="comments" Type="${R}/comments" Target="comments.xml"/></Relationships>`,
    'word/header1.xml': `<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>`,
    'word/comments.xml': `<w:comments xmlns:w="${W}"><w:comment w:id="7" w:author="Grace"><w:p><w:r><w:t>Review</w:t></w:r></w:p></w:comment></w:comments>`,
  });
  expect(result).toMatchObject({
    kind: 'structure',
    items: expect.arrayContaining([
      expect.objectContaining({
        id: 'p1',
        kind: 'paragraph',
        style: 'Title',
        anchor: { format: 'docx', paragraph: 0 },
      }),
      expect.objectContaining({
        id: 't1',
        kind: 'table',
        rows: 1,
        columns: 1,
        merged_cells: 1,
        text: 'Cell',
      }),
      expect.objectContaining({
        id: 'p2',
        text: 'Added',
        anchor: { format: 'docx', paragraph: 1 },
      }),
      expect.objectContaining({ kind: 'header', text: 'Header' }),
      expect.objectContaining({ kind: 'comment', author: 'Grace', text: 'Review' }),
      expect.objectContaining({ kind: 'change', change_type: 'ins', author: 'Ada' }),
      expect.objectContaining({ kind: 'change', change_type: 'del', text: 'Removed' }),
      expect.objectContaining({ kind: 'field', text: 'PAGE' }),
    ]),
  });
});

function workbook(sheet: string) {
  return {
    'xl/workbook.xml': `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Data" sheetId="1" state="hidden" r:id="r1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="r1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${S}">${sheet}</worksheet>`,
  };
}

test('distinguishes cached zero/empty-string formulas, missing caches, and error cells', () => {
  const result = inspect(
    'xlsx',
    workbook(`<dimension ref="A1:E1"/><sheetData><row r="1">
    <c r="A1"><f>1-1</f><v>0</v></c><c r="B1" t="str"><f>IF(1,"","")</f><v/></c>
    <c r="C1"><f>SUM(A1)</f></c><c r="D1" t="e"><f>1/0</f><v>#DIV/0!</v></c>
    <c r="E1"><f>2+2</f><v/></c></row></sheetData><mergeCells><mergeCell ref="A3:B3"/></mergeCells>`),
  );
  expect(result).toMatchObject({
    formula_values: 'saved-cache-only',
    items: [
      {
        sheet: 'Data',
        state: 'hidden',
        range: 'A1:E1',
        cells: 5,
        formulas: 5,
        cached_formulas: 3,
        uncached_formulas: 2,
        error_cells: 1,
        merges: 1,
      },
    ],
    findings: {
      total: 3,
      items: [
        { sheet: 'Data', cell: 'C1', kind: 'uncached_formula', formula: 'SUM(A1)' },
        { sheet: 'Data', cell: 'D1', kind: 'error', formula: '1/0', value: '#DIV/0!' },
        { sheet: 'Data', cell: 'E1', kind: 'uncached_formula', formula: '2+2' },
      ],
    },
  });
});

test('pages all worksheet findings and can inspect sheet XML larger than the DOM editing limit', () => {
  const text = 'x'.repeat(2 * 1024 * 1024);
  const data = workbook(
    `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${text}</t></is></c></row>${Array.from({ length: 105 }, (_, index) => `<row r="${index + 2}"><c r="A${index + 2}"><f>1+1</f></c></row>`).join('')}</sheetData>`,
  );
  expect(inspect('xlsx', data, { finding_offset: 100 })).toMatchObject({
    items: [{ cells: 106, formulas: 105, uncached_formulas: 105 }],
    findings: {
      total: 105,
      offset: 100,
      items: [
        expect.objectContaining({ cell: 'A102' }),
        expect.objectContaining({ cell: 'A103' }),
        expect.objectContaining({ cell: 'A104' }),
        expect.objectContaining({ cell: 'A105' }),
        expect.objectContaining({ cell: 'A106' }),
      ],
    },
  });
});

const transform = (x: number, y: number, width: number, height: number) =>
  `<a:xfrm><a:off x="${x * 914400}" y="${y * 914400}"/><a:ext cx="${width * 914400}" cy="${height * 914400}"/></a:xfrm>`;
const shape = (id: number, props: string, placeholder = '') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr>${placeholder}</p:nvPr></p:nvSpPr><p:spPr>${props}</p:spPr><p:txBody><a:p><a:r><a:rPr sz="2400"><a:latin typeface="Aptos"/></a:rPr><a:t>Text ${id}</a:t></a:r></a:p></p:txBody></p:sp>`;
function presentation(content: string, additional: Record<string, string> = {}) {
  return {
    'ppt/presentation.xml': `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="s1" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`,
    'ppt/slides/slide1.xml': `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree>${content}</p:spTree></p:cSld></p:sld>`,
    ...additional,
  };
}

test('resolves group coordinates and inherited placeholders, and reports layout findings', () => {
  const grouped = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="10" name="Group"/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="1828800" y="914400"/><a:ext cx="7315200" cy="7315200"/><a:chOff x="0" y="0"/><a:chExt cx="3657600" cy="3657600"/></a:xfrm></p:grpSpPr>${shape(2, transform(1, 1, 1, 1))}</p:grpSp>`;
  const result = inspect(
    'pptx',
    presentation(
      grouped + shape(3, transform(4.5, 3.5, 2, 1)) + shape(4, '', '<p:ph type="title"/>'),
      {
        'ppt/slides/_rels/slide1.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="layout" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
        'ppt/slideLayouts/slideLayout1.xml': `<p:sldLayout xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree>${shape(1, transform(-0.5, 0, 2, 1), '<p:ph type="title"/>')}</p:spTree></p:cSld></p:sldLayout>`,
      },
    ),
  );
  expect(result).toMatchObject({
    width: 13.333333333333334,
    height: 7.5,
    units: 'inches',
    items: [
      {
        slide: 1,
        shapes: [
          expect.objectContaining({
            nodeId: '2',
            box: { x: 4, y: 3, width: 2, height: 2, source: 'shape' },
            fonts: ['Aptos'],
            font_sizes: [24],
          }),
          expect.objectContaining({ nodeId: '3' }),
          expect.objectContaining({
            nodeId: '4',
            box: { x: -0.5, y: 0, width: 2, height: 1, source: 'layout' },
          }),
        ],
      },
    ],
    findings: {
      items: expect.arrayContaining([
        { slide: 1, kind: 'outside_slide', nodeIds: ['4'] },
        { slide: 1, kind: 'overlapping_text_boxes', nodeIds: ['2', '3'] },
      ]),
    },
  });
});

test('reports unresolved geometry instead of silently claiming the slide passed', () => {
  expect(inspect('pptx', presentation(shape(1, '')))).toMatchObject({
    findings: {
      total: 1,
      items: [{ slide: 1, kind: 'unresolved_geometry', nodeIds: ['1'] }],
    },
  });
});
