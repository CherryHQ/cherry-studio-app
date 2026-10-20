// Trusted code for a fresh QuickJS compute job. No model-written code, paths, network or DOM UI.
// The algorithms follow Desktop's office-transform patch-copy and run-edit recipes.
import { officeImageTransformCode } from './officeImageTransformCode';

export const officeTransformCode = String.raw`
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const fail = message => { throw new Error(message); };
const bytes = Uint8Array.from(atob(sourceBase64), c => c.charCodeAt(0));
const seen = new Set();
let inflated = 0;
const parts = zip.unzipSync(bytes, { filter: entry => {
  inflated += entry.originalSize;
  if (seen.has(entry.name) || seen.size >= 2048 || !Number.isSafeInteger(entry.originalSize) ||
      entry.originalSize > 4 * 1024 * 1024 || inflated > 16 * 1024 * 1024 ||
      entry.name.includes('\\') || entry.name.startsWith('/') || ['__proto__', 'constructor', 'prototype'].includes(entry.name) || entry.name.split('/').includes('..'))
    fail('The Office package has duplicate, unsafe or oversized parts.');
  seen.add(entry.name);
  return true;
}});
const docs = new Map();
const dirty = new Set();
function decode(data) {
  if (data[0] === 255 && data[1] === 254 || data[0] === 254 && data[1] === 255) {
    const little = data[0] === 255;
    if (data.length % 2) fail('Malformed UTF-16 XML.');
    let value = '';
    for (let i = 2; i < data.length; i += 2) value += String.fromCharCode(little ? data[i] | data[i+1] << 8 : data[i] << 8 | data[i+1]);
    return value;
  }
  if (data.subarray(0, 100).includes(0)) fail('XML must be UTF-8 or UTF-16 with a byte-order mark.');
  return zip.strFromU8(data).replace(/^\ufeff/, '');
}
function parse(text) {
  if (/<!DOCTYPE/i.test(text)) fail('Office XML with a DOCTYPE is unsupported.');
  const doc = new xml.DOMParser({ onError: (level, message) => fail('Invalid Office XML: ' + message) }).parseFromString(text, 'application/xml');
  if (!doc.documentElement || (doc.documentElement.namespaceURI || '').startsWith('http://purl.oclc.org/ooxml/'))
    fail('Strict OOXML is unsupported. Save a standard Office Open XML copy first.');
  return doc;
}
function document(path) {
  if (!docs.has(path)) {
    if (!Object.prototype.hasOwnProperty.call(parts, path)) fail('Missing Office part: ' + path);
    docs.set(path, parse(decode(parts[path])));
  }
  return docs.get(path);
}
function children(node, ns, name) {
  return Array.from(node.childNodes).filter(child => child.nodeType === 1 && child.namespaceURI === ns && child.localName === name);
}
function all(node, ns, name) { return Array.from(node.getElementsByTagNameNS(ns, name)); }
function one(node, ns, name) {
  const found = children(node, ns, name);
  if (found.length !== 1) fail('Expected one ' + name + ' element.');
  return found[0];
}
function relationPath(owner) {
  const slash = owner.lastIndexOf('/');
  return owner.slice(0, slash + 1) + '_rels/' + owner.slice(slash + 1) + '.rels';
}
function relationship(owner, id, type) {
  const matches = all(document(relationPath(owner)), REL, 'Relationship').filter(r => r.getAttribute('Id') === id);
  if (matches.length !== 1 || matches[0].getAttribute('TargetMode') === 'External' || matches[0].getAttribute('Type') !== R + '/' + type)
    fail('The selected Office relationship is missing, external or unsupported.');
  const target = matches[0].getAttribute('Target');
  if (!target || /[:\\?#%]/.test(target)) fail('Unsupported Office relationship target.');
  const segments = target.startsWith('/') ? [] : owner.split('/').slice(0, -1);
  for (const item of target.split('/')) {
    if (!item || item === '.') continue;
    if (item === '..') { if (!segments.length) fail('Relationship escapes the package.'); segments.pop(); }
    else segments.push(item);
  }
  return segments.join('/');
}
function freshElement(parent, ns, name) {
  const prefix = parent.prefix ? parent.prefix + ':' : '';
  return parent.ownerDocument.createElementNS(ns, prefix + name);
}
function setText(element, value) {
  while (element.firstChild) element.removeChild(element.firstChild);
  element.appendChild(element.ownerDocument.createTextNode(value));
  element.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
}
function checkRoot(path, ns, name) {
  const root = document(path).documentElement;
  if (root.namespaceURI !== ns || root.localName !== name) fail('File content does not match its Office format.');
  return root;
}
function wordParagraphs() { return children(one(checkRoot('word/document.xml', W, 'document'), W, 'body'), W, 'p'); }
function wordParagraph(anchor) {
  const paragraphs = wordParagraphs();
  const node = paragraphs[anchor.paragraph];
  if (!node) fail('Word paragraph no longer exists.');
  if (anchor.paraId) {
    const matches = paragraphs.filter(p => p.getAttributeNS('http://schemas.microsoft.com/office/word/2010/wordml', 'paraId') === anchor.paraId);
    if (matches.length !== 1 || matches[0] !== node) fail('Word paragraph id and ordinal disagree.');
  }
  return { node, path: 'word/document.xml', ns: W };
}
function slides() { return all(checkRoot('ppt/presentation.xml', P, 'presentation'), P, 'sldId'); }
function slidePath(number) {
  const slide = slides()[number - 1];
  if (!slide) fail('Slide no longer exists.');
  return relationship('ppt/presentation.xml', slide.getAttributeNS(R, 'id'), 'slide');
}
function slideShapes(path) {
  const root = checkRoot(path, P, 'sld');
  return all(root, P, 'cNvPr').map(id => ({ id: id.getAttribute('id'), node: id.parentNode.parentNode }))
    .filter(shape => ['sp', 'graphicFrame', 'pic'].includes(shape.node.localName));
}
function slideParagraph(anchor) {
  const path = slidePath(anchor.slide);
  const found = slideShapes(path).filter(shape => shape.id === anchor.nodeId);
  if (found.length !== 1) fail('Slide shape no longer exists or is ambiguous.');
  let container = found[0].node;
  if (anchor.tableCell) {
    const table = all(container, A, 'tbl');
    const row = table.length === 1 && children(table[0], A, 'tr')[anchor.tableCell.row];
    container = row && children(row, A, 'tc')[anchor.tableCell.col];
    if (!container) fail('Slide table cell no longer exists.');
  } else if (all(container, A, 'tbl').length) fail('Specify tableCell when editing a slide table.');
  const node = all(container, A, 'p')[anchor.paragraph];
  if (!node) fail('Slide paragraph no longer exists.');
  return { node, path, ns: A };
}
function paragraphText(node, ns) {
  let text = '';
  function walk(parent) {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType !== 1) continue;
      if (child.namespaceURI !== ns) continue;
      if (child.localName === 't') text += child.textContent;
      else if (['br', 'cr'].includes(child.localName)) text += '\n';
      else if (child.localName === 'tab') text += '\t';
      else if (!['pPr', 'rPr', 'endParaRPr', 'del', 'moveFrom'].includes(child.localName)) walk(child);
    }
  }
  walk(node);
  return text;
}
function replaceParagraph(target, edit) {
  const { node, path, ns } = target;
  const text = paragraphText(node, ns);
  if (text !== edit.expect_text) fail('Paragraph text changed. Read it again before editing.');
  const range = paragraphRange(text, edit.anchor);
  const selected = text.slice(range[0], range[1]);
  const relativeStart = selected.indexOf(edit.find);
  if (relativeStart < 0 || selected.indexOf(edit.find, relativeStart + 1) !== -1) fail('find must occur exactly once in the selected paragraph or character range.');
  const start = range[0] + relativeStart;
  const end = start + edit.find.length;
  const runs = [];
  let position = 0;
  function walk(parent) {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType !== 1) continue;
      if (child.namespaceURI !== ns) fail('The paragraph contains unsupported content.');
      const name = child.localName;
      if (['pPr', 'rPr', 'endParaRPr'].includes(name)) continue;
      if (name === 't') {
        runs.push({ node: child, start: position, end: position + child.textContent.length });
        position += child.textContent.length;
      } else if (['br', 'cr', 'tab'].includes(name)) {
        if (ns === W && child.getAttributeNS(W, 'type') && child.getAttributeNS(W, 'type') !== 'textWrapping') fail('Page and column breaks cannot be edited.');
        position++;
      } else if (name === 'r' || ns === W && name === 'hyperlink') walk(child);
      else fail('Fields, drawings, comments, bookmarks and tracked changes are not supported by this text edit.');
    }
  }
  walk(node);
  let written = false;
  for (const run of runs) {
    if (run.end <= start || run.start >= end) continue;
    const original = run.node.textContent;
    const before = original.slice(0, Math.max(0, start - run.start));
    const after = end < run.end ? original.slice(end - run.start) : '';
    setText(run.node, before + (written ? '' : edit.replace) + after);
    written = true;
  }
  if (!written || paragraphText(node, ns) !== text.slice(0, start) + edit.replace + text.slice(end)) fail('The requested text range cannot be safely replaced.');
  dirty.add(path);
}
function paragraphRange(text, anchor) {
  const range = anchor.charRange || [0, text.length];
  if (range[0] > range[1] || range[1] > text.length) fail('Character range is outside the paragraph.');
  return range;
}
function sheets() { return all(checkRoot('xl/workbook.xml', S, 'workbook'), S, 'sheet'); }
function sheetPath(name) {
  const found = sheets().filter(sheet => sheet.getAttribute('name') === name);
  if (found.length !== 1) fail('Worksheet name is missing or ambiguous.');
  return relationship('xl/workbook.xml', found[0].getAttributeNS(R, 'id'), 'worksheet');
}
function coordinate(value) {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(value);
  if (!match) fail('Invalid A1 coordinate.');
  let col = 0;
  for (const char of match[1]) col = col * 26 + char.charCodeAt(0) - 64;
  const row = Number(match[2]);
  if (col > 16384 || row > 1048576) fail('Cell is outside the Excel grid.');
  return { col, row };
}
function bounds(value) {
  const ends = value.split(':');
  const first = coordinate(ends[0]), last = coordinate(ends[1] || ends[0]);
  if (first.col > last.col || first.row > last.row) fail('Range endpoints are reversed.');
  return { first, last };
}
function contains(range, point) { return point.row >= range.first.row && point.row <= range.last.row && point.col >= range.first.col && point.col <= range.last.col; }
function address(col, row) {
  let letters = '';
  while (col) { col--; letters = String.fromCharCode(65 + col % 26) + letters; col = Math.floor(col / 26); }
  return letters + row;
}
${officeImageTransformCode}
function sheetCells(root) {
  const map = new Map();
  for (const cell of all(one(root, S, 'sheetData'), S, 'c')) {
    const ref = cell.getAttribute('r');
    coordinate(ref);
    if (map.has(ref)) fail('Duplicate worksheet cells.');
    map.set(ref, cell);
  }
  return map;
}
let sharedStrings;
function valueOfCell(cell) {
  if (!cell) return { value: null };
  const raw = children(cell, S, 'v')[0]?.textContent || '';
  const type = cell.getAttribute('t');
  let value = raw;
  if (type === 's') {
    if (!/^\d+$/.test(raw)) fail('Invalid shared string reference.');
    const index = Number(raw);
    const strings = sharedStrings || (sharedStrings = all(document('xl/sharedStrings.xml'), S, 'si'));
    if (!Number.isSafeInteger(index) || !strings[index]) fail('Invalid shared string reference.');
    value = all(strings[index], S, 't').map(t => t.textContent).join('');
  } else if (type === 'inlineStr') value = all(cell, S, 't').map(t => t.textContent).join('');
  else if (type === 'b') { if (!['0', '1'].includes(raw)) fail('Invalid boolean cell.'); value = raw === '1'; }
  else if (!type || type === 'n') { value = raw === '' ? null : Number(raw); if (value !== null && !Number.isFinite(value)) fail('Invalid numeric cell.'); }
  const formula = children(cell, S, 'f')[0];
  return { value, type: type || 'n', ...(formula ? { formula: formula.textContent, cached: true } : {}) };
}
function editSheet() {
  const path = sheetPath(request.sheet);
  const root = checkRoot(path, S, 'worksheet');
  if (children(root, S, 'sheetProtection').length) fail('Protected worksheets cannot be edited.');
  const data = one(root, S, 'sheetData');
  const cells = sheetCells(root);
  const merges = all(root, S, 'mergeCell').map(cell => bounds(cell.getAttribute('ref')));
  const groups = all(root, S, 'f').filter(f => ['shared', 'array', 'dataTable'].includes(f.getAttribute('t')));
  const edited = new Set();
  let replacedFormula = false;
  for (const change of request.cells) {
    const point = coordinate(change.address);
    if (edited.has(change.address)) fail('Duplicate cell edits.');
    edited.add(change.address);
    if (merges.some(range => contains(range, point) && (range.first.col !== point.col || range.first.row !== point.row))) fail('Only the top-left cell of a merged range can be edited.');
    if (groups.some(f => f.parentNode.getAttribute('r') === change.address || f.hasAttribute('ref') && contains(bounds(f.getAttribute('ref')), point))) fail('Shared, array and data-table formula groups cannot be edited.');
    let cell = cells.get(change.address);
    if (!cell) {
      let row = children(data, S, 'row').find(r => Number(r.getAttribute('r')) === point.row);
      if (!row) {
        row = freshElement(data, S, 'row'); row.setAttribute('r', String(point.row));
        data.insertBefore(row, children(data, S, 'row').find(r => Number(r.getAttribute('r')) > point.row) || null);
      }
      cell = freshElement(row, S, 'c'); cell.setAttribute('r', change.address);
      row.insertBefore(cell, children(row, S, 'c').find(c => coordinate(c.getAttribute('r')).col > point.col) || null);
      cells.set(change.address, cell);
    }
    if (cell.hasAttribute('cm') || cell.hasAttribute('vm')) fail('Cells with dynamic-array or rich-value metadata cannot be edited.');
    for (const child of Array.from(cell.childNodes)) {
      if (child.nodeType === 1 && (child.namespaceURI !== S || !['f', 'v', 'is'].includes(child.localName))) fail('Cell contains unsupported extension content.');
    }
    if (children(cell, S, 'f').length) replacedFormula = true;
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    cell.removeAttribute('t');
    if (typeof change.value === 'string') {
      cell.setAttribute('t', 'inlineStr');
      const is = freshElement(cell, S, 'is'), t = freshElement(cell, S, 't');
      setText(t, change.value); is.appendChild(t); cell.appendChild(is);
    } else if (change.value !== null) {
      if (typeof change.value === 'boolean') cell.setAttribute('t', 'b');
      const v = freshElement(cell, S, 'v');
      v.appendChild(v.ownerDocument.createTextNode(typeof change.value === 'boolean' ? change.value ? '1' : '0' : String(change.value)));
      cell.appendChild(v);
    }
  }
  // Removing dimension is legal; readers derive the used range instead of trusting stale bounds.
  for (const dimension of children(root, S, 'dimension')) root.removeChild(dimension);
  dirty.add(path);
  const workbook = document('xl/workbook.xml').documentElement;
  let calc = children(workbook, S, 'calcPr')[0];
  if (!calc) {
    calc = freshElement(workbook, S, 'calcPr');
    const successors = ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'];
    workbook.insertBefore(calc, Array.from(workbook.childNodes).find(n => n.nodeType === 1 && successors.includes(n.localName)) || null);
  }
  calc.setAttribute('fullCalcOnLoad', '1'); calc.setAttribute('forceFullCalc', '1');
  dirty.add('xl/workbook.xml');
  if (replacedFormula) {
    const relPath = relationPath('xl/workbook.xml');
    for (const rel of all(document(relPath), REL, 'Relationship')) {
      if (rel.getAttribute('Type') !== R + '/calcChain') continue;
      const chain = relationship('xl/workbook.xml', rel.getAttribute('Id'), 'calcChain');
      delete parts[chain]; rel.parentNode.removeChild(rel); dirty.add(relPath);
      const types = document('[Content_Types].xml');
      for (const type of all(types, CT, 'Override')) if (type.getAttribute('PartName') === '/' + chain) { type.parentNode.removeChild(type); dirty.add('[Content_Types].xml'); }
    }
  }
}
function inspect() {
  if (request.kind === 'images') return inspectPictures();
  const offset = request.offset, limit = request.limit;
  if (request.format === 'xlsx') {
    const list = sheets();
    return { total: list.length, offset, items: list.slice(offset, offset + limit).map(s => ({ sheet: s.getAttribute('name') })) };
  }
  if (request.format === 'docx') {
    const list = wordParagraphs();
    return { total: list.length, offset, items: list.slice(offset, offset + limit).map((p, i) => ({ anchor: { format: 'docx', paragraph: offset + i, ...(p.getAttributeNS('http://schemas.microsoft.com/office/word/2010/wordml', 'paraId') ? { paraId: p.getAttributeNS('http://schemas.microsoft.com/office/word/2010/wordml', 'paraId') } : {}) }, excerpt: paragraphText(p, W).slice(0, 300) })) };
  }
  const list = slides();
  return { total: list.length, offset, items: list.slice(offset, offset + limit).map((_, i) => ({ slide: offset + i + 1, shape_total: slideShapes(slidePath(offset + i + 1)).length, shape_offset: request.shape_offset, shapes: slideShapes(slidePath(offset + i + 1)).slice(request.shape_offset, request.shape_offset + 50).map(shape => ({ nodeId: shape.id, kind: shape.node.localName, paragraphs: all(shape.node, A, 'p').length, excerpt: all(shape.node, A, 't').map(t => t.textContent).join(' ').slice(0, 150), table: all(shape.node, A, 'tbl').map(table => children(table, A, 'tr').map(row => children(row, A, 'tc').length)) })) })) };
}
function read() {
  const anchor = request.anchor;
  if (anchor.format === 'xlsx') {
    const range = bounds(anchor.range);
    if ((range.last.row - range.first.row + 1) * (range.last.col - range.first.col + 1) > 1000) fail('Read at most 1000 cells at once.');
    const cells = sheetCells(checkRoot(sheetPath(anchor.sheet), S, 'worksheet'));
    const rows = [];
    for (let row = range.first.row; row <= range.last.row; row++) {
      const values = [];
      for (let col = range.first.col; col <= range.last.col; col++) { const ref = address(col, row); values.push({ address: ref, ...valueOfCell(cells.get(ref)) }); }
      rows.push(values);
    }
    return { anchor, rows };
  }
  const target = anchor.format === 'docx' ? wordParagraph(anchor) : slideParagraph(anchor);
  const text = paragraphText(target.node, target.ns);
  const range = paragraphRange(text, anchor);
  return { anchor, text, ...(anchor.charRange ? { selected_text: text.slice(range[0], range[1]) } : {}) };
}
if (request.operation === 'inspect') return inspect();
if (request.operation === 'read') return read();
if (Object.keys(parts).some(path => path.startsWith('_xmlsignatures/'))) fail('Signed Office documents cannot be edited without invalidating their signatures.');
const paths = Object.keys(parts);
let hasMacros = paths.some(path => /(?:^|\/)vbaProject\.bin$/i.test(path));
if (parts['[Content_Types].xml']) {
  const types = checkRoot('[Content_Types].xml', CT, 'Types');
  const overrides = new Map(children(types, CT, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')]));
  const defaults = new Map(children(types, CT, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')]));
  // Generators may declare macro defaults that no package part actually uses.
  hasMacros ||= paths.some(path => /macroEnabled|vbaProject/i.test(overrides.get(path) ?? defaults.get(path.split('.').pop().toLowerCase()) ?? ''));
}
if (hasMacros) fail('Macro-enabled Office documents are not supported for editing.');
if (request.format === 'docx' && parts['word/settings.xml'] && all(document('word/settings.xml'), W, 'documentProtection').some(node => ['true', '1', 'on'].includes(node.getAttributeNS(W, 'enforcement')))) fail('Protected Word documents cannot be edited.');
if (request.format === 'xlsx') { if (request.cells?.length) editSheet(); }
else for (const edit of request.edits || []) replaceParagraph(request.format === 'docx' ? wordParagraph(edit.anchor) : slideParagraph(edit.anchor), edit);
replacePictures();
for (const path of dirty) {
  const text = new xml.XMLSerializer().serializeToString(docs.get(path).documentElement);
  parse(text);
  parts[path] = zip.strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + text);
}
const outputParts = Object.values(parts);
if (outputParts.length > 2048 || outputParts.some(part => part.length > 4 * 1024 * 1024) || outputParts.reduce((total, part) => total + part.length, 0) > 16 * 1024 * 1024)
  fail('Edited Office package exceeds the package limits.');
const output = zip.zipSync(parts, { level: 6 });
if (output.length > 4 * 1024 * 1024) fail('Edited Office file exceeds 4 MiB.');
let binary = '';
for (let offset = 0; offset < output.length; offset += 8192) binary += String.fromCharCode(...output.subarray(offset, offset + 8192));
return { data: btoa(binary) };
`;
