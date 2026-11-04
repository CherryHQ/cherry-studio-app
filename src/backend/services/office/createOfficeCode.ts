import { officeRuntimeCode } from './officePackageCode';
import type { OfficeFormat, OfficeRequest } from './officeSpec';
import docx from './vendor/docx.json';
import pptxgenjs from './vendor/pptxgenjs.json';
import xlsx from './vendor/xlsx.json';
import { workbookImagesCode } from './workbookImagesCode';

// JSZip schedules in-memory compression chunks through setImmediate. This shim is private to
// this compute job; it neither installs timers nor changes the model's Code Mode VM.
export const officeSchedulerCode = String.raw`
const pending = new Map();
let nextTask = 0;
globalThis.setImmediate = (callback, ...args) => {
  const id = ++nextTask;
  pending.set(id, true);
  queueMicrotask(() => { if (pending.delete(id)) callback(...args); });
  return id;
};
globalThis.clearImmediate = id => { pending.delete(id); };
globalThis.setTimeout = (callback, delay = 0, ...args) => {
  if (delay !== 0) throw new Error('Office generation does not support timers.');
  return setImmediate(callback, ...args);
};
globalThis.clearTimeout = clearImmediate;
`;

const documentRenderer = String.raw`
const { Document, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Packer, HeadingLevel, WidthType, LevelFormat, AlignmentType } = library;
const heading = { title: HeadingLevel.TITLE, heading1: HeadingLevel.HEADING_1, heading2: HeadingLevel.HEADING_2 };
const runs = (text, bold) => text.split(/\r\n|\r|\n/).map((line, index) => new TextRun({ text: line, bold, ...(index ? { break: 1 } : {}) }));
const children = [];
const numbering = [];
for (const [index, block] of spec.blocks.entries()) {
  if (block.type === 'paragraph') {
    children.push(new Paragraph({ children: runs(block.text), heading: heading[block.style], spacing: { after: 160 } }));
  } else if (block.type === 'list') {
    const reference = 'list-' + index;
    if (block.ordered) numbering.push({ reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] });
    for (const item of block.items) children.push(new Paragraph({ children: runs(item), ...(block.ordered ? { numbering: { reference, level: 0 } } : { bullet: { level: 0 } }) }));
  } else if (block.type === 'table') {
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: block.rows.map((row, rowIndex) => new TableRow({
      tableHeader: Boolean(block.header && rowIndex === 0),
      children: row.map(value => new TableCell({ children: [new Paragraph({ children: runs(value, Boolean(block.header && rowIndex === 0)) })] })),
    })) }));
    children.push(new Paragraph(''));
  } else {
    const image = images[block.file_entry_id];
    const scale = Math.min(1, 600 / block.width_px, 800 / block.height_px);
    children.push(new Paragraph({ children: [new ImageRun({
      type: image.mediaType === 'image/png' ? 'png' : 'jpg', data: readInput(image.index),
      transformation: { width: Math.max(1, Math.round(block.width_px * scale)), height: Math.max(1, Math.round(block.height_px * scale)) },
      altText: { title: block.alt || '', description: block.alt || '', name: 'Image' },
    })] }));
  }
}
const file = new Document({ creator: 'Cherry Studio', title: spec.title || '', numbering: { config: numbering }, sections: [{ children }] });
return saveOffice(await Packer.toArrayBuffer(file), 'docx');
`;

const workbookRenderer = `
const book = library.utils.book_new();
const formats = { general: 'General', integer: '0', decimal: '0.00', percent: '0.00%' };
for (const input of spec.sheets) {
  // aoa_to_sheet preserves scalar types: strings beginning with '=' are text, never formulas.
  const sheet = library.utils.aoa_to_sheet(input.rows);
  if (input.column_widths) sheet['!cols'] = input.column_widths.map(wch => ({ wch }));
  if (input.column_formats) {
    for (let row = 0; row < input.rows.length; row++) {
      for (let column = 0; column < input.column_formats.length; column++) {
        const cell = sheet[library.utils.encode_cell({ r: row, c: column })];
        if (cell && cell.t === 'n') cell.z = formats[input.column_formats[column]];
      }
    }
  }
  library.utils.book_append_sheet(book, sheet, input.name);
}
const result = library.write(book, { bookType: 'xlsx', type: 'array', compression: true });
if (!spec.sheets.some(sheet => sheet.images?.length)) return saveOffice(result, 'xlsx');
${workbookImagesCode}
`;

const presentationRenderer = `
const deck = new library();
deck.layout = 'LAYOUT_WIDE';
deck.author = 'Cherry Studio';
deck.subject = spec.title || '';
deck.title = spec.title || '';
deck.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };
const dark = spec.theme === 'dark';
const foreground = dark ? 'F5F5F5' : '202124';
// PptxGenJS decodes base64 images in plain JavaScript (about 6 s per 30 MiB); it gets a 1-pixel
// stand-in, and the real bytes replace it in the package below.
const standIn = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBE8AAAAASUVORK5CYII=';
const media = [];
for (const [slideIndex, input] of spec.slides.entries()) {
  const slide = deck.addSlide();
  slide.background = { color: dark ? '18202B' : 'FFFFFF' };
  const titleOnly = input.type === 'title';
  slide.addText(input.title, { x: 0.65, y: titleOnly ? 1.9 : 0.4, w: 12, h: titleOnly ? 1.4 : 0.8, fontFace: 'Aptos Display', fontSize: titleOnly ? 40 : 28, bold: true, color: foreground, fit: 'shrink', margin: 0, breakLine: false });
  if (titleOnly) {
    if (input.subtitle) slide.addText(input.subtitle, { x: 0.65, y: 3.6, w: 11.8, h: 1.6, fontSize: 24, color: foreground, fit: 'shrink', margin: 0 });
  } else if (input.type === 'bullets') {
    slide.addText(input.items.map(text => ({ text, options: { bullet: { indent: 22 }, hanging: 5, breakLine: true } })), { x: 0.7, y: 1.6, w: 11.9, h: 5.2, fontSize: 22, color: foreground, fit: 'shrink', valign: 'top', paraSpaceAfter: 14, margin: 0 });
  } else if (input.type === 'table') {
    slide.addTable(input.rows, { x: 0.65, y: 1.6, w: 12, h: 5.2, fontSize: 12, color: foreground, fill: dark ? '253140' : 'F3F5F7', border: { type: 'solid', pt: 1, color: dark ? '566273' : 'D6DADE' }, margin: 0.07, autoPage: false });
  } else {
    const image = images[input.file_entry_id];
    const scale = Math.min(12 / input.width_px, 5.2 / input.height_px);
    const w = input.width_px * scale;
    const h = input.height_px * scale;
    slide.addImage({ data: 'data:' + image.mediaType + ';base64,' + standIn, x: 0.65 + (12 - w) / 2, y: 1.6 + (5.2 - h) / 2, w, h, altText: input.alt || '' });
    // PptxGenJS names a slide's first image image-<slide>-1.<subtype>.
    media.push(['ppt/media/image-' + (slideIndex + 1) + '-1.' + image.mediaType.slice(6), image.index]);
  }
}
// Uncompressed output: PptxGenJS would deflate media too. The repack below compresses only XML.
const parts = zip.unzipSync(await deck.write({ outputType: 'uint8array' }));
for (const [path, index] of media) {
  if (!parts[path]) throw new Error('The generated presentation is missing ' + path + '.');
  parts[path] = readInput(index);
}
return saveOffice(zip.zipSync(parts, { level: 6 }), 'pptx');
`;

// Packer deflates every part; for photos that only costs time (25 s for 30 MiB in QuickJS).
const storeDocumentMedia = String.raw`
const compiler = module.exports.Packer.compiler;
const compile = compiler.compile.bind(compiler);
compiler.compile = (...args) => {
  const archive = compile(...args);
  for (const [name, file] of Object.entries(archive.files))
    if (/[.](?:jpe?g|png|gif|webp|tiff?)$/i.test(name)) file.options.compression = 'STORE';
  return archive;
};`;

// docx names each image by a pure-JavaScript SHA-1 of its bytes, about 10 s per 30 MiB in QuickJS.
// The name only deduplicates media, so the same data object (inputs[id].bytes is cached) keeps one id.
const DOCX_IMAGE_HASH =
  'var hashedId = (data) => import_hash.default.sha1().update(data instanceof ArrayBuffer ? new Uint8Array(data) : data).digest("hex");';
if (!docx.code.includes(DOCX_IMAGE_HASH)) throw new Error('The pinned docx image naming changed.');
const docxCode = docx.code.replace(
  DOCX_IMAGE_HASH,
  `var hashedId = (() => { const objects = new WeakMap(), texts = new Map(); let next = 0;
  return data => { const ids = typeof data === 'string' ? texts : objects; if (!ids.has(data)) ids.set(data, (++next).toString(16).padStart(40, '0')); return ids.get(data); }; })();`,
);

// PptxGenJS 4.0.1 writes one master, but declares a different master for every slide. Keep its
// content types aligned with the actual parts; package checks must still reject dangling entries.
const PPTX_MASTER_OVERRIDE =
  '`<Override PartName="/ppt/slideMasters/slideMaster${t+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`';
if (!pptxgenjs.code.includes(PPTX_MASTER_OVERRIDE))
  throw new Error('The pinned PptxGenJS master declaration changed.');
const pptxCode = pptxgenjs.code.replace(
  PPTX_MASTER_OVERRIDE,
  `(t===0?${PPTX_MASTER_OVERRIDE.replace('${t+1}', '1')}:"")`,
);

/** An expression evaluating to the pinned generator library for one format. */
export function officeLibraryCode(format: OfficeFormat): string {
  if (format === 'docx')
    return `(() => { const module = { exports: {} }; const exports = module.exports;\n${docxCode}\n${storeDocumentMedia}\nreturn module.exports; })()`;
  if (format === 'xlsx') return `(() => {\n${xlsx.code}\nreturn XLSX; })()`;
  return `(() => { const window = globalThis;\n${pptxCode}\nreturn PptxGenJS; })()`;
}

const renderers: Record<OfficeFormat, string> = {
  docx: documentRenderer,
  xlsx: workbookRenderer,
  pptx: presentationRenderer,
};

/** An image the job reads from its input file at `index`. */
export type OfficeImageInput = { index: number; mediaType: 'image/png' | 'image/jpeg' };

/** Only app-owned code is executable; model text and image references are JSON data. */
export function createOfficeCode(
  request: OfficeRequest,
  images: Readonly<Record<string, OfficeImageInput>>,
): string {
  return `${officeRuntimeCode}\n${officeSchedulerCode}\nconst library = ${officeLibraryCode(request.format)};\nconst { spec, images } = ${JSON.stringify({ spec: request.spec, images })};\n${renderers[request.format]}`;
}
