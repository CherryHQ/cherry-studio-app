import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { createOfficeCode } from '../createOfficeCode';
import type { OfficeFormat, OfficeRequest } from '../officeSpec';
import { createOfficeScriptCode } from '../runOfficeScript';
import { createOfficeTransformCode } from '../transformOfficeFile';
import { runOfficeJob, runOfficeJobSync } from './_officeJob';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const SOURCE = '00000000-0000-7000-8000-000000000001';

function archive(overrides: Record<string, string> = {}) {
  return zipSync(
    Object.fromEntries(
      Object.entries({
        '[Content_Types].xml': `<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
        '_rels/.rels': `<Relationships xmlns="${REL}"><Relationship Id="main" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,
        'word/document.xml': `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`,
        ...overrides,
      }).map(([name, value]) => [name, strToU8(value)]),
    ),
  );
}

type Finding = { rule: string; part: string; severity: string; key: string };
type Check = {
  error?: string;
  errors: number;
  warnings: number;
  existing: number;
  total: number;
  findings: Finding[];
};

function check(
  bytes: Uint8Array,
  original?: Uint8Array,
  limit = 100,
  format: OfficeFormat = 'docx',
) {
  return runOfficeJobSync(
    createOfficeTransformCode({
      operation: 'inspect',
      format,
      kind: 'check',
      against: !!original,
      offset: 0,
      limit,
      shape_offset: 0,
    }),
    original ? [bytes, original] : [bytes],
  ).value as Check;
}

test('accepts generated documents, workbooks and presentations with their real relationships', async () => {
  const requests: OfficeRequest[] = [
    {
      format: 'docx',
      filename: 'a.docx',
      spec: { version: 1, blocks: [{ type: 'paragraph', text: 'Hello' }] },
    },
    {
      format: 'xlsx',
      filename: 'a.xlsx',
      spec: { version: 1, sheets: [{ name: 'Data', rows: [[1, 'Text']] }] },
    },
    {
      format: 'pptx',
      filename: 'a.pptx',
      spec: {
        version: 1,
        slides: [
          { type: 'title', title: 'Hello' },
          { type: 'title', title: 'Second slide' },
        ],
      },
    },
  ];
  for (const request of requests) {
    const { output } = await runOfficeJob(createOfficeCode(request, {}));
    expect(check(output!, undefined, 100, request.format)).toMatchObject({ errors: 0 });
  }
});

test('findings are paged successful results and comparison excludes unchanged original defects', () => {
  const original = archive({
    'word/_rels/document.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="old" Type="${R}/image" Target="media/old.png"/></Relationships>`,
  });
  const parts = unzipSync(original);
  parts['word/document.xml'] = strToU8(
    strFromU8(parts['word/document.xml']).replace('<w:p>', '<w:p><w:hyperlink r:id="new"/>'),
  );
  const edited = zipSync(parts);
  expect(check(edited, original)).toMatchObject({
    errors: 1,
    existing: 1,
    total: 1,
    findings: [expect.objectContaining({ rule: 'unknown-relationship', location: 'new' })],
  });
  const all = check(edited, undefined, 1);
  expect(all.error).toBeUndefined();
  expect(all.errors).toBe(2);
  expect(all.total).toBe(2);
  expect(all.findings).toHaveLength(1);
});

test('checks content types, internal targets, relationship ids and comments', () => {
  const source = archive({
    'word/document.xml': `<w:document xmlns:w="${W}"><w:body><w:p><w:commentReference w:id="7"/></w:p></w:body></w:document>`,
    'word/_rels/document.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="r1" Type="${R}/image" Target="media/absent.png"/><Relationship Id="r1" Type="${R}/image" Target="media/second.png"/><Relationship Id="outside" Type="${R}/image" Target="../../secret.png"/></Relationships>`,
    'word/media/image.png': 'data',
  });
  expect(check(source).findings.map((finding) => finding.rule)).toEqual(
    expect.arrayContaining([
      'duplicate-relationship-id',
      'dangling-relationship',
      'invalid-target',
      'missing-content-type',
      'missing-comment',
    ]),
  );
});

test('resolves percent-encoded targets and treats external links as inert metadata', () => {
  const source = archive({
    'word/_rels/document.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="item" Type="${R}/customXml" Target="../customXml/a%20b.xml"/><Relationship Id="url" Type="${R}/hyperlink" Target="https://example.com/?a=1&amp;b=2" TargetMode="External"/></Relationships>`,
    'customXml/a b.xml': '<root/>',
  });
  expect(check(source)).toMatchObject({ errors: 0 });
});

test('does not skip malformed XML above the old 1 MiB validation cutoff', () => {
  const source = archive({
    'customXml/large.xml': '<root>' + 'x'.repeat(1024 * 1024 + 10) + '</different>',
  });
  expect(check(source).findings).toContainEqual(
    expect.objectContaining({ rule: 'malformed-xml', part: 'customXml/large.xml' }),
  );
});

test.each([
  '<root><unclosed></root>',
  '<root/><second/>',
  '<!DOCTYPE root [<!ENTITY a "text">]><root>&a;</root>',
  '<root xmlns:a="urn:test" xmlns:b="urn:test" a:x="1" b:x="2"/>',
  '<root><undeclared:element/></root>',
])('rejects malformed or unsupported XML: %s', (xml) => {
  expect(check(archive({ 'customXml/item.xml': xml })).findings).toContainEqual(
    expect.objectContaining({ rule: 'malformed-xml', part: 'customXml/item.xml' }),
  );
});

test('counts additional duplicates even when the original already contains one', () => {
  const relationships = (count: number) =>
    `<Relationships xmlns="${REL}">${Array.from({ length: count }, () => `<Relationship Id="url" Type="${R}/hyperlink" Target="https://example.com" TargetMode="External"/>`).join('')}</Relationships>`;
  const original = archive({ 'word/_rels/document.xml.rels': relationships(2) });
  const after = archive({ 'word/_rels/document.xml.rels': relationships(3) });
  expect(check(after, original)).toMatchObject({ errors: 1, existing: 1 });
});

test('rejects corrupt script output before writing while allowing unchanged baseline defects', async () => {
  const source = archive({
    'word/_rels/document.xml.rels': `<Relationships xmlns="${REL}"><Relationship Id="old" Type="${R}/image" Target="media/absent.png"/></Relationships>`,
  });
  const inputs = {
    [SOURCE]: {
      name: 'a.docx',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: source.length,
    },
  };
  const same = await runOfficeJob(
    createOfficeScriptCode('docx', `return inputs['${SOURCE}'].bytes;`, inputs, SOURCE),
    [source],
  );
  expect(same.output).toEqual(source);
  const script = `const parts = zip.unzipSync(inputs['${SOURCE}'].bytes);
    delete parts['word/document.xml']; return zip.zipSync(parts);`;
  await expect(
    runOfficeJob(createOfficeScriptCode('docx', script, inputs, SOURCE), [source]),
  ).rejects.toThrow('word/document.xml is missing');
});

test('script mutations of its inputs cannot replace the untouched comparison baseline', async () => {
  const source = archive();
  const code = createOfficeScriptCode(
    'docx',
    `
    const parts = zip.unzipSync(inputs['${SOURCE}'].bytes);
    const doc = new xml.DOMParser().parseFromString(zip.strFromU8(parts['word/document.xml']), 'application/xml');
    doc.documentElement.setAttributeNS('${R}', 'r:id', 'missing');
    parts['word/document.xml'] = zip.strToU8(new xml.XMLSerializer().serializeToString(doc));
    const output = zip.zipSync(parts);
    inputs['${SOURCE}'] = { bytes: output };
    return output;
  `,
    {
      [SOURCE]: {
        name: 'source.docx',
        mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: source.length,
      },
    },
    SOURCE,
  );
  await expect(runOfficeJob(code, [source])).rejects.toThrow('unknown-relationship');
});
