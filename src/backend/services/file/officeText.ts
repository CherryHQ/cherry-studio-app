import { read, utils } from '@e965/xlsx';
import { DOMParser, type Document, type Element, type Node } from '@xmldom/xmldom';
import {
  strFromU8,
  Unzip,
  type UnzipFileInfo,
  UnzipInflate,
  unzipSync,
  zipSync,
} from 'fflate/browser';

import type { DocumentFileType } from '@/shared/utils/documentFileTypes';

const MAX_ZIP_ENTRIES = 2_048;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_XML_BYTES = 4 * 1024 * 1024;
const ZIP_READ_CHUNK_BYTES = 1_024;
const MAX_SHEET_ROWS = 10_000;
const MAX_SHEETS = 100;
const MAX_TEXT_CHARACTERS = 1_000_000;
const RELATIONSHIP_NAMESPACE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NOTES_LAYOUT_PLACEHOLDERS = new Set(['sldNum', 'dt', 'hdr', 'ftr', 'sldImg']);

export type ExtractedDocumentText = { text: string; truncated: boolean };

/** Local OOXML extraction; ZIP entries never become filesystem paths. */
export function extractOfficeText(
  bytes: Uint8Array,
  type: Exclude<DocumentFileType, 'pdf'>,
): ExtractedDocumentText {
  let entryCount = 0;
  let totalBytes = 0;
  const directory = new Map<string, UnzipFileInfo>();
  const entries = unzipSync(bytes, {
    filter(entry) {
      entryCount += 1;
      totalBytes += entry.originalSize;
      if (
        entryCount > MAX_ZIP_ENTRIES ||
        totalBytes > MAX_UNCOMPRESSED_BYTES ||
        directory.has(entry.name)
      ) {
        throw new Error('Office archive exceeds extraction limits or contains duplicate entries.');
      }
      directory.set(entry.name, entry);
      const isXml = entry.name.endsWith('.xml') || entry.name.endsWith('.rels');
      if (isXml && entry.originalSize > MAX_XML_BYTES) {
        throw new Error('Office XML exceeds the extraction size limit.');
      }
      return type !== 'xlsx' && isXml;
    },
  });
  if (!directory.has('[Content_Types].xml')) throw new Error('Not an Office Open XML document.');

  const xml = (path: string): Document => {
    const content = entries[path];
    if (!content) throw new Error('An Office document part is missing.');
    const text = strFromU8(content);
    if (/<!DOCTYPE|<!ENTITY/i.test(text))
      throw new Error('Office XML declarations are unsupported.');
    return new DOMParser({
      onError: () => {
        throw new Error('Malformed Office XML.');
      },
    }).parseFromString(text, 'application/xml');
  };
  const output = textCollector();
  let hasContent = false;

  if (type === 'xlsx') {
    if (!directory.has('xl/workbook.xml')) throw new Error('Excel workbook is missing.');
    // SheetJS re-reads ZIP headers; give it only stored entries built from bounded XML.
    const workbookBytes = zipSync(unzipWorkbookXml(bytes, directory), { level: 0 });
    const workbook = read(workbookBytes, {
      type: 'array',
      sheetRows: MAX_SHEET_ROWS,
      cellFormula: true,
    });
    if (workbook.SheetNames.length > MAX_SHEETS) output.truncated = true;
    for (const name of workbook.SheetNames.slice(0, MAX_SHEETS)) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      output.append(`Sheet: ${name}\n`);
      if (sheet['!fullref'] && sheet['!fullref'] !== sheet['!ref']) output.truncated = true;
      // Iterate populated cells, not the declared rectangle: sparse sheets may span millions of cells.
      for (const address of Object.keys(sheet)) {
        if (address.startsWith('!')) continue;
        const cell = sheet[address];
        if (!cell) continue;
        const value = cell.v === undefined ? '' : utils.format_cell(cell);
        if (value || cell.f) {
          hasContent = true;
          output.append(`${address}: ${value}${cell.f ? ` [=${cell.f}]` : ''}\n`);
        }
        if (output.full) break;
      }
      if (output.full) break;
    }
  } else if (type === 'docx') {
    const body = paragraphText(xml('word/document.xml'));
    hasContent = body.trim().length > 0;
    output.append(body);
    for (const path of Object.keys(entries).sort()) {
      if (!/^word\/(header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(path)) continue;
      const text = paragraphText(xml(path));
      hasContent ||= text.trim().length > 0;
      output.append(`\n${text}`);
      if (output.full) break;
    }
  } else {
    const presentation = xml('ppt/presentation.xml');
    const presentationRelationships = xml('ppt/_rels/presentation.xml.rels');
    const slides = presentation.getElementsByTagNameNS('*', 'sldId');
    for (let index = 0; index < slides.length; index += 1) {
      if (output.full) break;
      const slide = slides.item(index);
      const slideId =
        slide?.getAttributeNS(RELATIONSHIP_NAMESPACE, 'id') ??
        slide?.getAttributeNS('http://purl.oclc.org/ooxml/officeDocument/relationships', 'id');
      const slidePath = relationshipTarget(
        presentationRelationships,
        slideId,
        'ppt/presentation.xml',
      );
      if (!slidePath) throw new Error('A presentation slide relationship is missing.');
      const text = paragraphText(xml(slidePath));
      hasContent ||= text.trim().length > 0;
      output.append(`Slide ${index + 1}\n${text}\n`);
      const slideRelationships = relationshipPath(slidePath);
      if (!entries[slideRelationships]) continue;
      const relationships = xml(slideRelationships);
      const note = Array.from(relationships.getElementsByTagNameNS('*', 'Relationship')).find(
        (item) => item.getAttribute('Type')?.endsWith('/notesSlide'),
      );
      const notesPath = relationshipTarget(relationships, note?.getAttribute('Id'), slidePath);
      if (notesPath) {
        const notes = speakerNotesText(xml(notesPath));
        if (notes.trim()) {
          hasContent = true;
          output.append(`Notes\n${notes}\n`);
        }
      }
    }
  }
  return { text: hasContent ? output.text.trim() : '', truncated: output.truncated || output.full };
}

function unzipWorkbookXml(
  bytes: Uint8Array,
  directory: ReadonlyMap<string, UnzipFileInfo>,
): Record<string, Uint8Array> {
  const remaining = new Map(directory);
  const entries: Record<string, Uint8Array> = {};
  let pendingEntries = 0;
  const unzip = new Unzip((file) => {
    const entry = remaining.get(file.name);
    if (
      !entry ||
      entry.compression !== file.compression ||
      (file.size !== undefined && file.size !== entry.size) ||
      (file.originalSize !== undefined && file.originalSize !== entry.originalSize)
    ) {
      throw new Error('Office archive entry does not match its directory.');
    }
    remaining.delete(file.name);
    if (!file.name.endsWith('.xml') && !file.name.endsWith('.rels')) return;

    const content = new Uint8Array(entry.originalSize);
    let offset = 0;
    pendingEntries += 1;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      if (chunk.length > content.length - offset) {
        throw new Error('Office archive entry exceeds its declared size.');
      }
      content.set(chunk, offset);
      offset += chunk.length;
      if (final) {
        if (offset !== content.length) {
          throw new Error('Office archive entry does not match its declared size.');
        }
        entries[file.name] = content;
        pendingEntries -= 1;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // Bound each decoder push as well as the retained output, even for high-ratio DEFLATE data.
  for (let offset = 0; offset < bytes.length; offset += ZIP_READ_CHUNK_BYTES) {
    const end = Math.min(offset + ZIP_READ_CHUNK_BYTES, bytes.length);
    unzip.push(bytes.subarray(offset, end), end === bytes.length);
  }
  if (remaining.size > 0 || pendingEntries > 0) {
    throw new Error('Office archive is missing entries.');
  }
  return entries;
}

function speakerNotesText(document: Document): string {
  for (const shape of Array.from(document.getElementsByTagNameNS('*', 'sp'))) {
    const placeholder = shape.getElementsByTagNameNS('*', 'ph').item(0);
    if (NOTES_LAYOUT_PLACEHOLDERS.has(placeholder?.getAttribute('type') ?? '')) {
      shape.parentNode?.removeChild(shape);
    }
  }
  return paragraphText(document);
}

function paragraphText(document: Document): string {
  const paragraphs = document.getElementsByTagNameNS('*', 'p');
  const lines: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs.item(index);
    if (!paragraph) continue;
    const nodes: Node[] = Array.from(paragraph.childNodes).toReversed();
    const fragments: string[] = [];
    while (nodes.length > 0) {
      const node = nodes.pop()!;
      if (node.nodeType !== 1) continue;
      const element = node as Element;
      if (element.localName === 't') fragments.push(element.textContent ?? '');
      else if (element.localName === 'tab') fragments.push('\t');
      else if (element.localName === 'br' || element.localName === 'cr') fragments.push('\n');
      else if (element.localName !== 'p') {
        for (let childIndex = element.childNodes.length - 1; childIndex >= 0; childIndex -= 1) {
          const child = element.childNodes.item(childIndex);
          if (child) nodes.push(child);
        }
      }
    }
    if (fragments.length > 0) lines.push(fragments.join(''));
  }
  return lines.join('\n');
}

function relationshipTarget(
  relationships: Document,
  id: string | null | undefined,
  owner: string,
): string | undefined {
  if (!id) return undefined;
  const relationship = Array.from(relationships.getElementsByTagNameNS('*', 'Relationship')).find(
    (item) => item.getAttribute('Id') === id,
  );
  const target = relationship?.getAttribute('Target');
  if (!target || relationship?.getAttribute('TargetMode') === 'External') return undefined;
  const segments = target.startsWith('/') ? [] : owner.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') segments.pop();
    else if (segment && segment !== '.') segments.push(segment);
  }
  return segments.join('/');
}

function relationshipPath(owner: string): string {
  const segments = owner.split('/');
  const filename = segments.pop();
  return [...segments, '_rels', `${filename}.rels`].join('/');
}

function textCollector() {
  return {
    text: '',
    truncated: false,
    full: false,
    append(value: string) {
      const remaining = MAX_TEXT_CHARACTERS - this.text.length;
      if (value.length > remaining) this.truncated = true;
      if (value.length >= remaining) this.full = true;
      let end = Math.min(remaining, value.length);
      if (end > 0 && /[\uD800-\uDBFF]/u.test(value[end - 1]!)) end -= 1;
      this.text += value.slice(0, end);
    },
  };
}
