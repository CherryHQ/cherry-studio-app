import { DOMParser } from '@xmldom/xmldom';
import { strFromU8, unzipSync } from 'fflate/browser';

import { createImagePresentation } from '../imagePresentation';

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

test('streams lossless image bytes and produces a connected PresentationML package', () => {
  const chunks: Uint8Array[] = [];
  const writer = createImagePresentation((chunk) => chunks.push(chunk));
  const first = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
  const second = new Uint8Array([137, 80, 78, 71, 5, 6, 7, 8]);
  const page = writer.addSlide(1280, 720);
  page.push(first.subarray(0, 4));
  const streamedBytes = chunks.reduce((size, chunk) => size + chunk.length, 0);
  page.push(first.subarray(4), true);
  expect(chunks.reduce((size, chunk) => size + chunk.length, 0)).toBeGreaterThan(streamedBytes);
  writer.addSlide(720, 1280).push(second, true);
  writer.finish();
  const entries = unzipSync(concat(chunks));
  expect(entries['ppt/media/image1.png']).toEqual(first);
  expect(entries['ppt/media/image2.png']).toEqual(second);

  const parser = new DOMParser({
    onError: () => {
      throw new Error('Malformed XML');
    },
  });
  const xml = (path: string) => parser.parseFromString(strFromU8(entries[path]), 'application/xml');
  const presentation = xml('ppt/presentation.xml');
  expect(presentation.getElementsByTagNameNS(P, 'sldId').length).toBe(2);
  const size = presentation.getElementsByTagNameNS(P, 'sldSz')[0];
  expect(Number(size.getAttribute('cx')) / Number(size.getAttribute('cy'))).toBeCloseTo(16 / 9);

  for (const path of Object.keys(entries)) {
    if (!path.endsWith('.rels')) continue;
    const directory = path === '_rels/.rels' ? '' : path.slice(0, path.indexOf('/_rels/')) + '/';
    const relationships = xml(path).getElementsByTagName('Relationship');
    for (let i = 0; i < relationships.length; i++) {
      const target = new URL(
        relationships[i].getAttribute('Target')!,
        `https://package.invalid/${directory}`,
      ).pathname.slice(1);
      expect(entries[target]).toBeDefined();
    }
  }
  const contentTypes = xml('[Content_Types].xml').getElementsByTagName('Override');
  for (let i = 0; i < contentTypes.length; i++) {
    const path = contentTypes[i].getAttribute('PartName')!.slice(1);
    expect(entries[path]).toBeDefined();
    xml(path);
  }
  const portrait = xml('ppt/slides/slide2.xml');
  const picture = portrait.getElementsByTagNameNS(P, 'pic')[0];
  const ext = picture.getElementsByTagNameNS(A, 'ext')[0];
  const off = picture.getElementsByTagNameNS(A, 'off')[0];
  expect(Number(ext.getAttribute('cx')) / Number(ext.getAttribute('cy'))).toBeCloseTo(720 / 1280);
  expect(Number(off.getAttribute('x'))).toBeGreaterThan(0);
  expect(off.getAttribute('y')).toBe('0');
  expect(portrait.getElementsByTagNameNS(A, 't').length).toBe(0);
});

function concat(chunks: Uint8Array[]) {
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
