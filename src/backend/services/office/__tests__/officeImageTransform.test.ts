import { posix } from 'node:path';
import { runInNewContext } from 'node:vm';

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { createOfficeCode } from '../createOfficeCode';
import { officeEditSchemas, type OfficeTransformRequest } from '../officeEditSpec';
import type { OfficeFormat, OfficeImage, OfficeRequest } from '../officeSpec';
import { createOfficeTransformCode } from '../transformOfficeFile';

const IMAGE_ID = '00000000-0000-7000-8000-000000000001';
const SOURCE_ID = '00000000-0000-7000-8000-000000000002';
const PNG: OfficeImage = {
  mediaType: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBE8AAAAASUVORK5CYII=',
};
const JPEG: OfficeImage = {
  mediaType: 'image/jpeg',
  data: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlaKKK+dP2Y//Z',
};
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const pictureNamespaces = {
  docx: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  xlsx: XDR,
  pptx: P,
};
const owners = {
  docx: 'word/document.xml',
  xlsx: 'xl/drawings/drawing1.xml',
  pptx: 'ppt/slides/slide1.xml',
};
type Parts = Record<string, Uint8Array>;
type ImageItem = {
  anchor: {
    format: OfficeFormat;
    image_index?: number;
    sheet?: string;
    slide?: number;
    nodeId?: string;
  };
  name: string;
  alt: string;
  replaceable: boolean;
  reason?: string;
  width_px?: number;
  height_px?: number;
  cell?: string;
};
function document(parts: Parts, path: string) {
  return new DOMParser().parseFromString(strFromU8(parts[path]), 'application/xml');
}
function write(parts: Parts, path: string, doc: ReturnType<typeof document>) {
  parts[path] = strToU8(new XMLSerializer().serializeToString(doc));
}
function relationPath(owner: string) {
  return posix.join(posix.dirname(owner), '_rels', posix.basename(owner) + '.rels');
}
function pictureNodes(parts: Parts, format: OfficeFormat) {
  return Array.from(
    document(parts, owners[format]).getElementsByTagNameNS(pictureNamespaces[format], 'pic'),
  );
}
function imageReferences(parts: Parts, format: OfficeFormat) {
  const relations = Array.from(
    document(parts, relationPath(owners[format])).getElementsByTagNameNS(REL, 'Relationship'),
  );
  return pictureNodes(parts, format).map((node) => {
    const blip = node.getElementsByTagNameNS(A, 'blip')[0];
    const id = blip.getAttributeNS(R, 'embed');
    const target = relations
      .find((relation) => relation.getAttribute('Id') === id)!
      .getAttribute('Target')!;
    return posix.normalize(posix.join(posix.dirname(owners[format]), target));
  });
}

async function fixture(format: OfficeFormat) {
  const image = { file_entry_id: IMAGE_ID, width_px: 120, height_px: 80, alt: 'Product photo' };
  const requests: Record<OfficeFormat, OfficeRequest> = {
    docx: {
      format: 'docx',
      filename: 'source.docx',
      spec: {
        version: 1,
        blocks: [
          { type: 'paragraph', text: 'Keep this text' },
          { ...image, type: 'image' },
          { ...image, type: 'image' },
        ],
      },
    },
    xlsx: {
      format: 'xlsx',
      filename: 'source.xlsx',
      spec: {
        version: 1,
        sheets: [
          {
            name: 'Products',
            rows: [['Keep', 123]],
            images: [
              { ...image, cell: 'C4' },
              { ...image, cell: 'D5' },
            ],
          },
        ],
      },
    },
    pptx: {
      format: 'pptx',
      filename: 'source.pptx',
      spec: {
        version: 1,
        slides: [
          { ...image, type: 'image', title: 'Keep this title' },
          { type: 'title', title: 'Unchanged slide' },
        ],
      },
    },
  };
  const data: string = await runInNewContext(
    `(async () => { ${createOfficeCode(requests[format], { [IMAGE_ID]: PNG })} })()`,
    { queueMicrotask, atob, btoa },
  );
  const parts = unzipSync(new Uint8Array(Buffer.from(data, 'base64')));
  const doc = document(parts, owners[format]);
  let nodes = doc.getElementsByTagNameNS(pictureNamespaces[format], 'pic');
  if (format === 'pptx') {
    const copy = nodes[0].cloneNode(true);
    copy.getElementsByTagNameNS(P, 'cNvPr')[0].setAttribute('id', '42');
    nodes[0].parentNode!.appendChild(copy);
    nodes = doc.getElementsByTagNameNS(pictureNamespaces[format], 'pic');
  }
  // Both occurrences deliberately share one relationship/media part.
  const first = nodes[0].getElementsByTagNameNS(A, 'blip')[0];
  nodes[1]
    .getElementsByTagNameNS(A, 'blip')[0]
    .setAttributeNS(R, 'r:embed', first.getAttributeNS(R, 'embed')!);
  const fill = nodes[0].getElementsByTagNameNS(pictureNamespaces[format], 'blipFill')[0];
  const crop = doc.createElementNS(A, 'a:srcRect');
  crop.setAttribute('l', '12000');
  fill.insertBefore(crop, fill.getElementsByTagNameNS(A, 'stretch')[0]);
  nodes[0].getElementsByTagNameNS(A, 'xfrm')[0].setAttribute('rot', '2700000');
  write(parts, owners[format], doc);
  return parts;
}

// Executes the shipped ZIP/XML code. Native budgets and visual fidelity need device/Office acceptance.
function operate(parts: Parts, request: OfficeTransformRequest) {
  return runInNewContext(
    `(() => { ${createOfficeTransformCode(zipSync(parts), request, { [IMAGE_ID]: JPEG })} })()`,
    { atob, btoa },
    { timeout: 5000 },
  ) as {
    error?: string;
    data?: string;
    kind?: string;
    total?: number;
    offset?: number;
    items?: ImageItem[];
  };
}
function inspect(parts: Parts, format: OfficeFormat, offset = 0, limit = 30) {
  const result = operate(parts, {
    operation: 'inspect',
    format,
    kind: 'images',
    offset,
    limit,
    shape_offset: 0,
  });
  expect(result.error).toBeUndefined();
  return result;
}
function editRequest(format: OfficeFormat, items: ImageItem[]): OfficeTransformRequest {
  return {
    operation: 'edit',
    format,
    ...officeEditSchemas[format].parse({
      version: 1,
      file_entry_id: SOURCE_ID,
      filename: `copy.${format}`,
      source_sha256: 'a'.repeat(64),
      ...(format === 'xlsx' ? { sheet: 'Products' } : {}),
      images: items.map((item) => ({ anchor: item.anchor, file_entry_id: IMAGE_ID })),
    }),
  } as OfficeTransformRequest;
}
function outputParts(result: ReturnType<typeof operate>) {
  expect(result.error).toBeUndefined();
  expect(result.data).toBeDefined();
  return unzipSync(new Uint8Array(Buffer.from(result.data!, 'base64')));
}

test.each<OfficeFormat>(['docx', 'xlsx', 'pptx'])(
  '%s replaces only the selected shared-image occurrence and preserves its geometry',
  async (format) => {
    const source = await fixture(format);
    const snapshot = Object.fromEntries(
      Object.entries(source).map(([path, bytes]) => [path, bytes.slice()]),
    );
    const found = inspect(source, format);
    expect(found).toMatchObject({ kind: 'images', total: 2, offset: 0 });
    expect(found.items!.every((item) => item.replaceable)).toBe(true);
    expect(found.items![0]).toMatchObject({ alt: 'Product photo' });
    if (format === 'xlsx')
      expect(found.items![0]).toMatchObject({ cell: 'C4', width_px: 120, height_px: 80 });
    expect(inspect(source, format, 1, 1).items).toEqual([found.items![1]]);
    const oldRefs = imageReferences(source, format);
    expect(oldRefs[0]).toBe(oldRefs[1]);
    const output = outputParts(operate(source, editRequest(format, [found.items![0]])));
    const refs = imageReferences(output, format);
    expect(refs[1]).toBe(oldRefs[1]);
    expect(refs[0]).not.toBe(oldRefs[0]);
    expect(output[refs[0]]).toEqual(new Uint8Array(Buffer.from(JPEG.data, 'base64')));
    expect(output[oldRefs[0]]).toEqual(source[oldRefs[0]]);
    const before = pictureNodes(source, format),
      after = pictureNodes(output, format);
    after[0]
      .getElementsByTagNameNS(A, 'blip')[0]
      .setAttributeNS(
        R,
        'r:embed',
        before[0].getElementsByTagNameNS(A, 'blip')[0].getAttributeNS(R, 'embed')!,
      );
    expect(after.map((node) => node.toString())).toEqual(before.map((node) => node.toString()));
    const changed = new Set([owners[format], relationPath(owners[format]), '[Content_Types].xml']);
    for (const [path, bytes] of Object.entries(source))
      if (!changed.has(path)) expect(output[path]).toEqual(bytes);
    expect(
      document(output, '[Content_Types].xml').getElementsByTagNameNS(CT, 'Override').length,
    ).toBeGreaterThan(0);
    expect(inspect(output, format).items).toMatchObject([
      { replaceable: true, mediaType: 'image/jpeg' },
      { replaceable: true, mediaType: 'image/png' },
    ]);
    expect(source).toEqual(snapshot);
  },
);

test('deduplicates replacement media while giving each changed occurrence its own reference', async () => {
  const source = await fixture('docx');
  const output = outputParts(operate(source, editRequest('docx', inspect(source, 'docx').items!)));
  const refs = imageReferences(output, 'docx');
  expect(refs[0]).toBe(refs[1]);
  expect(Object.keys(output).filter((path) => !source[path])).toEqual([refs[0]]);
  const relationships = pictureNodes(output, 'docx').map((node) =>
    node.getElementsByTagNameNS(A, 'blip')[0].getAttributeNS(R, 'embed'),
  );
  expect(new Set(relationships).size).toBe(2);
});

test('refuses duplicate targets and a later invalid replacement without returning a partial file', async () => {
  const source = await fixture('docx');
  const first = inspect(source, 'docx').items![0];
  expect(operate(source, editRequest('docx', [first, first]))).toEqual({
    error: 'Duplicate image replacements.',
  });
  const invalid = { ...first, anchor: { ...first.anchor, image_index: 999 } };
  expect(operate(source, editRequest('docx', [first, invalid]))).toEqual({
    error: 'Picture no longer exists or its anchor is ambiguous.',
  });
});

test.each(['external', 'svg-extension', 'tracked-change', 'content-control', 'alternate-content'])(
  'marks %s pictures unsupported and refuses replacement',
  async (kind) => {
    const source = await fixture('docx');
    const doc = document(source, owners.docx);
    const node = doc.getElementsByTagNameNS(pictureNamespaces.docx, 'pic')[0];
    const blip = node.getElementsByTagNameNS(A, 'blip')[0];
    if (kind === 'external') blip.setAttributeNS(R, 'r:link', 'external');
    else if (kind === 'svg-extension') blip.appendChild(doc.createElementNS(A, 'a:extLst'));
    else {
      const wrapper =
        kind === 'alternate-content'
          ? doc.createElementNS(
              'http://schemas.openxmlformats.org/markup-compatibility/2006',
              'mc:AlternateContent',
            )
          : doc.createElementNS(W, kind === 'tracked-change' ? 'w:ins' : 'w:sdt');
      node.parentNode!.replaceChild(wrapper, node);
      wrapper.appendChild(node);
    }
    write(source, owners.docx, doc);
    const item = inspect(source, 'docx').items![0];
    expect(item).toMatchObject({ replaceable: false, reason: expect.any(String) });
    expect(operate(source, editRequest('docx', [item])).error).toBe(item.reason);
  },
);

test('includes Word table pictures without rewriting the surrounding table', async () => {
  const source = await fixture('docx');
  const doc = document(source, owners.docx);
  const paragraphs = doc.getElementsByTagNameNS(W, 'p');
  const imageParagraph = paragraphs[1];
  const table = doc.createElementNS(W, 'w:tbl'),
    row = doc.createElementNS(W, 'w:tr'),
    cell = doc.createElementNS(W, 'w:tc');
  imageParagraph.parentNode!.replaceChild(table, imageParagraph);
  table.appendChild(row);
  row.appendChild(cell);
  cell.appendChild(imageParagraph);
  write(source, owners.docx, doc);
  const items = inspect(source, 'docx').items!;
  const output = outputParts(operate(source, editRequest('docx', [items[0]])));
  expect(document(output, owners.docx).getElementsByTagNameNS(W, 'tbl')).toHaveLength(1);
  expect(imageReferences(output, 'docx')[1]).toBe(imageReferences(source, 'docx')[1]);
});

test('refuses image-only changes in protected Word and Excel files', async () => {
  const word = await fixture('docx');
  const wordItem = inspect(word, 'docx').items![0];
  word['word/settings.xml'] = strToU8(
    `<w:settings xmlns:w="${W}"><w:documentProtection w:enforcement="1"/></w:settings>`,
  );
  expect(operate(word, editRequest('docx', [wordItem])).error).toMatch(/Protected Word/);
  const book = await fixture('xlsx');
  const doc = document(book, 'xl/worksheets/sheet1.xml');
  doc.documentElement!.appendChild(doc.createElementNS(S, 'sheetProtection'));
  write(book, 'xl/worksheets/sheet1.xml', doc);
  const item = inspect(book, 'xlsx').items![0];
  expect(item.replaceable).toBe(false);
  expect(operate(book, editRequest('xlsx', [item])).error).toMatch(/Protected worksheets/);
});

test('does not recalculate or rewrite cells during an image-only workbook edit', async () => {
  const source = await fixture('xlsx');
  const output = outputParts(
    operate(source, editRequest('xlsx', [inspect(source, 'xlsx').items![0]])),
  );
  expect(output['xl/workbook.xml']).toEqual(source['xl/workbook.xml']);
  expect(output['xl/worksheets/sheet1.xml']).toEqual(source['xl/worksheets/sheet1.xml']);
});

test('keeps consecutive replacements isolated and does not reuse occupied media names or relationships', async () => {
  const source = await fixture('docx');
  const first = outputParts(
    operate(source, editRequest('docx', [inspect(source, 'docx').items![0]])),
  );
  const second = outputParts(
    operate(first, editRequest('docx', [inspect(first, 'docx').items![0]])),
  );
  const firstRefs = imageReferences(first, 'docx'),
    secondRefs = imageReferences(second, 'docx');
  expect(secondRefs[0]).not.toBe(firstRefs[0]);
  expect(secondRefs[1]).toBe(firstRefs[1]);
  expect(second[firstRefs[0]]).toEqual(first[firstRefs[0]]);
  expect(inspect(second, 'docx').items!.every((item) => item.replaceable)).toBe(true);
});

test('rejects a mixed cell/image edit as a whole when image replacement fails', async () => {
  const source = await fixture('xlsx');
  const item = inspect(source, 'xlsx').items![0];
  const request = editRequest('xlsx', [{ ...item, anchor: { ...item.anchor, image_index: 999 } }]);
  if (request.operation === 'edit' && request.format === 'xlsx')
    request.cells = [{ address: 'B1', value: 999 }];
  expect(operate(source, request)).toEqual({
    error: 'Picture no longer exists or its anchor is ambiguous.',
  });
  expect(strFromU8(source['xl/worksheets/sheet1.xml'])).toContain('<v>123</v>');
});

test('refuses an output whose newly added image would exceed the readable ZIP entry limit', async () => {
  const source = await fixture('docx');
  const item = inspect(source, 'docx').items![0];
  for (let index = Object.keys(source).length; index < 2048; index++)
    source[`padding/part${index}.txt`] = strToU8('keep');
  expect(operate(source, editRequest('docx', [item]))).toEqual({
    error: 'Edited Office package exceeds the package limits.',
  });
});

test.each(['twoCellAnchor', 'absoluteAnchor'])(
  'preserves the entire Excel %s during replacement',
  async (kind) => {
    const source = await fixture('xlsx');
    const doc = document(source, owners.xlsx);
    const original = doc.getElementsByTagNameNS(XDR, 'oneCellAnchor')[0];
    const frame = doc.createElementNS(XDR, 'xdr:' + kind);
    if (kind === 'twoCellAnchor') {
      frame.appendChild(original.getElementsByTagNameNS(XDR, 'from')[0]);
      const to = doc.createElementNS(XDR, 'xdr:to');
      for (const [name, value] of [
        ['col', '5'],
        ['colOff', '100'],
        ['row', '8'],
        ['rowOff', '200'],
      ]) {
        const element = doc.createElementNS(XDR, 'xdr:' + name);
        element.appendChild(doc.createTextNode(value));
        to.appendChild(element);
      }
      frame.appendChild(to);
    } else {
      const position = doc.createElementNS(XDR, 'xdr:pos');
      position.setAttribute('x', '50000');
      position.setAttribute('y', '60000');
      frame.appendChild(position);
      frame.appendChild(original.getElementsByTagNameNS(XDR, 'ext')[0]);
    }
    frame.appendChild(original.getElementsByTagNameNS(XDR, 'pic')[0]);
    frame.appendChild(original.getElementsByTagNameNS(XDR, 'clientData')[0]);
    original.parentNode!.replaceChild(frame, original);
    write(source, owners.xlsx, doc);
    const item = inspect(source, 'xlsx').items![0];
    expect(item.replaceable).toBe(true);
    const output = outputParts(operate(source, editRequest('xlsx', [item])));
    const after = document(output, owners.xlsx).getElementsByTagNameNS(XDR, kind)[0];
    after
      .getElementsByTagNameNS(A, 'blip')[0]
      .setAttributeNS(
        R,
        'r:embed',
        frame.getElementsByTagNameNS(A, 'blip')[0].getAttributeNS(R, 'embed')!,
      );
    expect(after.toString()).toBe(frame.toString());
  },
);

test('replaces a grouped PPTX picture without flattening or moving the group', async () => {
  const source = await fixture('pptx');
  const doc = document(source, owners.pptx);
  const picture = doc.getElementsByTagNameNS(P, 'pic')[0];
  const group = doc.importNode(
    new DOMParser().parseFromString(
      `<p:grpSp xmlns:p="${P}" xmlns:a="${A}"><p:nvGrpSpPr><p:cNvPr id="99" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm rot="900000"><a:off x="50000" y="60000"/><a:ext cx="4000000" cy="3000000"/><a:chOff x="0" y="0"/><a:chExt cx="4000000" cy="3000000"/></a:xfrm></p:grpSpPr></p:grpSp>`,
      'application/xml',
    ).documentElement!,
    true,
  );
  picture.parentNode!.replaceChild(group, picture);
  group.appendChild(picture);
  write(source, owners.pptx, doc);
  const output = outputParts(
    operate(source, editRequest('pptx', [inspect(source, 'pptx').items![0]])),
  );
  const after = document(output, owners.pptx).getElementsByTagNameNS(P, 'grpSp')[0];
  after
    .getElementsByTagNameNS(A, 'blip')[0]
    .setAttributeNS(
      R,
      'r:embed',
      group.getElementsByTagNameNS(A, 'blip')[0].getAttributeNS(R, 'embed')!,
    );
  expect(after.toString()).toBe(group.toString());
});

test('refuses shared worksheet drawings instead of changing pictures on both sheets', async () => {
  const source = await fixture('xlsx');
  const path = 'xl/workbook.xml';
  const doc = document(source, path);
  const sheet = doc.getElementsByTagNameNS(S, 'sheet')[0];
  const copy = sheet.cloneNode(true);
  copy.setAttribute('name', 'Other');
  copy.setAttribute('sheetId', '2');
  sheet.parentNode!.appendChild(copy);
  write(source, path, doc);
  const items = inspect(source, 'xlsx').items!;
  expect(items).toHaveLength(4);
  expect(items.every((item) => !item.replaceable)).toBe(true);
  expect(operate(source, editRequest('xlsx', [items[0]])).error).toMatch(/shared drawing or slide/);
});

test('refuses shared slide parts instead of replacing pictures on both logical slides', async () => {
  const source = await fixture('pptx');
  const path = 'ppt/_rels/presentation.xml.rels';
  const doc = document(source, path);
  const relations = Array.from(doc.getElementsByTagNameNS(REL, 'Relationship')).filter(
    (rel) => rel.getAttribute('Type') === R + '/slide',
  );
  relations[1].setAttribute('Target', relations[0].getAttribute('Target')!);
  write(source, path, doc);
  const items = inspect(source, 'pptx').items!;
  expect(items).toHaveLength(4);
  expect(items.every((item) => !item.replaceable)).toBe(true);
  expect(operate(source, editRequest('pptx', [items[0]])).error).toMatch(/shared drawing or slide/);
});

test('validates image-only, mixed, empty and cross-format serialized requests', () => {
  const base = {
    version: 1,
    file_entry_id: SOURCE_ID,
    filename: 'copy.docx',
    source_sha256: 'a'.repeat(64),
  };
  const images = [{ anchor: { format: 'docx', image_index: 0 }, file_entry_id: IMAGE_ID }];
  expect(officeEditSchemas.docx.safeParse({ ...base, images }).success).toBe(true);
  expect(officeEditSchemas.docx.safeParse(base).success).toBe(false);
  expect(officeEditSchemas.docx.safeParse({ ...base, images: [] }).success).toBe(false);
  expect(
    officeEditSchemas.docx.safeParse({ ...base, images: Array(9).fill(images[0]) }).success,
  ).toBe(false);
  expect(officeEditSchemas.pptx.safeParse({ ...base, images }).success).toBe(false);
  expect(
    officeEditSchemas.xlsx.safeParse({
      ...base,
      sheet: 'Products',
      images: [
        { file_entry_id: IMAGE_ID, anchor: { format: 'xlsx', sheet: 'Other', image_index: 0 } },
      ],
    }).success,
  ).toBe(false);
  expect(
    officeEditSchemas.docx.safeParse({
      ...base,
      images,
      edits: [
        {
          anchor: { format: 'docx', paragraph: 0 },
          expect_text: 'Old',
          find: 'Old',
          replace: 'New',
        },
      ],
    }).success,
  ).toBe(true);
});
