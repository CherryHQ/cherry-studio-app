/**
 * Package integrity checks shared by inspection and publication inside QuickJS. XML is read with
 * xmldom's SAX callbacks, retaining only the current element stack and relationship metadata. A
 * large worksheet therefore receives the same checks as a small one without building its DOM.
 * This is a bounded package check, not Office's XSD validator or a rendering engine.
 */
export const officeCheckCode = String.raw`
const OFFICE_NS = {
  content: 'http://schemas.openxmlformats.org/package/2006/content-types',
  relationships: 'http://schemas.openxmlformats.org/package/2006/relationships',
  relationship: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  word: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  drawing: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  presentation: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  sheet: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
};
const officeMainParts = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' };
const officeMainTypes = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
};
function decodeOfficeXml(data) {
  if (data[0] === 255 && data[1] === 254 || data[0] === 254 && data[1] === 255) {
    if (data.length % 2) throw new Error('Malformed UTF-16 XML.');
    const little = data[0] === 255;
    const chunks = [];
    for (let offset = 2; offset < data.length; offset += 8192) {
      const codes = [];
      for (let i = offset; i < Math.min(offset + 8192, data.length); i += 2)
        codes.push(little ? data[i] | data[i + 1] << 8 : data[i] << 8 | data[i + 1]);
      chunks.push(String.fromCharCode.apply(null, codes));
    }
    return chunks.join('');
  }
  if (data.subarray(0, 100).includes(0)) throw new Error('XML must be UTF-8 or UTF-16 with a byte-order mark.');
  return zip.strFromU8(data).replace(/^\ufeff/, '');
}
function readOfficePackage(bytes, xmlOnly = false) {
  let expanded = 0;
  const names = new Set();
  let parts;
  try { parts = zip.unzipSync(bytes, { filter: entry => {
    expanded += entry.originalSize;
    if (names.has(entry.name) || names.size >= 4096 || !Number.isSafeInteger(entry.originalSize) ||
        entry.originalSize > 67108864 || expanded > 134217728 || entry.name.includes('\\') ||
        entry.name.startsWith('/') || entry.name.split('/').includes('..') ||
        ['__proto__', 'constructor', 'prototype'].includes(entry.name))
      throw new Error('The Office package has duplicate, unsafe or oversized parts.');
    names.add(entry.name);
    return !xmlOnly || /[.](xml|rels)$/i.test(entry.name);
  }}); } catch (error) {
    if (error.code === 13) throw new Error('The returned value is not a ZIP package.');
    throw error;
  }
  return { names, parts };
}
function officePartTarget(owner, target) {
  if (!target) throw new Error('Empty internal relationship target.');
  const decoded = decodeURIComponent(target.split('#')[0]);
  if (!decoded || /[:\\?\x00-\x1f]/.test(decoded)) throw new Error('Invalid internal relationship target.');
  const result = decoded.startsWith('/') ? [] : owner.split('/').slice(0, -1);
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!result.length) throw new Error('Relationship escapes the package.');
      result.pop();
    } else result.push(segment);
  }
  return result.join('/');
}
function officeRelationshipOwner(path) {
  if (path === '_rels/.rels') return '';
  const match = /^(.*\/)?_rels\/([^/]+)[.]rels$/.exec(path);
  if (!match) throw new Error('Invalid relationship part name.');
  return (match[1] || '') + match[2];
}
function scanOfficeXml(data, handlers = {}) {
  const text = decodeOfficeXml(data);
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(text)) throw new Error('Invalid XML character.');
  class Handler {
    constructor() {
      this.mimeType = 'application/xml';
      this.doc = new xml.DOMImplementation().createDocument(null, '');
      this.stack = [];
      this.currentElement = null;
    }
    startDocument() {}
    endDocument() {}
    setDocumentLocator() {}
    startPrefixMapping() {}
    endPrefixMapping() {}
    startCDATA() {}
    endCDATA() {}
    comment() {}
    processingInstruction(target, value) { this.doc.createProcessingInstruction(target, value); }
    startDTD() { throw new Error('Office XML with a DOCTYPE is unsupported.'); }
    endDTD() {}
    warning(message) {
      // U+FFFD is a legal character; it is not evidence that the file is malformed.
      if (!message.startsWith('Unicode replacement character detected')) throw new Error(message);
    }
    error(message) { throw new Error(message); }
    fatalError(message) { throw new Error(message); }
    startElement(ns, name, qualified, attrs) {
      if (this.stack.length >= 256) throw new Error('Office XML nesting exceeds 256 elements.');
      const node = this.doc.createElementNS(ns, qualified || name);
      const attributes = new Set();
      for (let i = 0; i < attrs.length; i++) {
        const attr = this.doc.createAttributeNS(attrs.getURI(i), attrs.getQName(i));
        const key = (attr.namespaceURI || '') + '|' + attr.localName;
        if (attributes.has(key)) throw new Error('Duplicate expanded XML attribute.');
        attributes.add(key);
        attr.value = attr.nodeValue = attrs.getValue(i);
        node.setAttributeNodeNS(attr);
      }
      if (!this.stack.length) this.doc.appendChild(node);
      handlers.start?.(node, this.stack);
      this.stack.push(node);
      this.currentElement = node;
    }
    endElement() {
      handlers.end?.(this.stack[this.stack.length - 1], this.stack);
      this.stack.pop();
      this.currentElement = this.stack[this.stack.length - 1] || null;
    }
    characters(value, start, length) {
      handlers.text?.(String(value).slice(start, start + length), this.currentElement, this.stack);
    }
  }
  new xml.DOMParser({ domHandler: Handler, locator: false }).parseFromString(text, 'application/xml');
}
function collectOfficeFindings(bytes, format) {
  const { names, parts } = readOfficePackage(bytes, true);
  const findings = [];
  const occurrences = new Map();
  const add = (rule, part, location, message, severity = 'error') => {
    if (findings.length >= 1000) throw new Error('Office check exceeded 1000 findings; the package could not be completely checked.');
    const identity = JSON.stringify([rule, part, location]);
    const occurrence = (occurrences.get(identity) || 0) + 1;
    occurrences.set(identity, occurrence);
    findings.push({ key: identity + ':' + occurrence, rule, part, location, severity, message });
  };
  const defaults = new Map(), overrides = new Map(), relationships = new Map(), references = new Map();
  const commentIds = new Set(), commentRefs = [];
  let metadataCount = 0;
  const countMetadata = () => {
    if (++metadataCount > 100000) throw new Error('Office relationship metadata exceeds the check limit.');
  };
  const unique = (set, value, rule, part, label) => {
    if (!value) add(rule, part, '', label + ' is missing.');
    else if (set.has(value)) add(rule, part, value, label + ' ' + value + ' is duplicated.');
    else { countMetadata(); set.add(value); }
  };
  if (!names.has(officeMainParts[format])) add('missing-main-part', officeMainParts[format], '', officeMainParts[format] + ' is missing.');
  for (const [part, data] of Object.entries(parts)) {
    const ids = new Map();
    const rels = new Map();
    const refs = new Set();
    const isRels = /[.]rels$/i.test(part);
    let owner;
    if (isRels) {
      try { owner = officeRelationshipOwner(part); }
      catch (error) { add('relationship-part', part, '', String(error.message)); }
      if (owner !== undefined) relationships.set(owner, rels);
    }
    references.set(part, refs);
    try {
      scanOfficeXml(data, {
        start(node, stack) {
          const ns = node.namespaceURI, name = node.localName;
          if (!stack.length) {
            if (part === '[Content_Types].xml' && (ns !== OFFICE_NS.content || name !== 'Types'))
              add('content-types-root', part, '', 'Content types part has an invalid root.');
            if (isRels && (ns !== OFFICE_NS.relationships || name !== 'Relationships'))
              add('relationships-root', part, '', 'Relationship part has an invalid root.');
            if (part === officeMainParts[format]) {
              const expected = { docx: [OFFICE_NS.word, 'document'], xlsx: [OFFICE_NS.sheet, 'workbook'], pptx: [OFFICE_NS.presentation, 'presentation'] }[format];
              if (ns !== expected[0] || name !== expected[1]) add('main-root', part, '', 'The main part does not match the requested Office format.');
            }
          }
          if (part === '[Content_Types].xml' && ns === OFFICE_NS.content && ['Default', 'Override'].includes(name)) {
            const value = node.getAttribute(name === 'Default' ? 'Extension' : 'PartName');
            const type = node.getAttribute('ContentType');
            const map = name === 'Default' ? defaults : overrides;
            let key = value;
            if (name === 'Default') key = value?.toLowerCase();
            else if (value?.startsWith('/')) key = officePartTarget('', value);
            else { add('content-type-name', part, value || '', 'Override PartName must be an absolute package part name.'); return; }
            if (!key || !type) add('content-type', part, key || '', 'Content type declaration is incomplete.');
            else if (map.has(key)) add('duplicate-content-type', part, key, 'Content type is declared more than once.');
            else { countMetadata(); map.set(key, type); }
          }
          if (isRels && ns === OFFICE_NS.relationships && name === 'Relationship') {
            const id = node.getAttribute('Id'), target = node.getAttribute('Target'), type = node.getAttribute('Type');
            const mode = node.getAttribute('TargetMode') || 'Internal';
            if (!id || !target || !type || !['External', 'Internal'].includes(mode))
              add('invalid-relationship', part, id || '', 'Relationship requires Id, Type, Target and a valid TargetMode.');
            if (rels.has(id)) add('duplicate-relationship-id', part, id || '', 'Relationship id is duplicated.');
            else { countMetadata(); rels.set(id, { target, type, mode }); }
          }
          for (let i = 0; i < node.attributes.length; i++) {
            const attr = node.attributes.item(i);
            if (attr.namespaceURI === OFFICE_NS.relationship && ['id', 'embed', 'link', 'dm', 'lo', 'qs', 'cs'].includes(attr.localName)) {
              if (!refs.has(attr.value)) { countMetadata(); refs.add(attr.value); }
            }
          }
          let idKind, value;
          if (ns === OFFICE_NS.presentation && ['cNvPr', 'sldId', 'sldMasterId', 'sldLayoutId'].includes(name)) {
            idKind = name; value = node.getAttribute('id');
          } else if (ns === OFFICE_NS.drawing && name === 'docPr') { idKind = 'docPr'; value = node.getAttribute('id'); }
          else if (ns === OFFICE_NS.word && name === 'p') {
            value = node.getAttributeNS('http://schemas.microsoft.com/office/word/2010/wordml', 'paraId');
            if (value) idKind = 'paraId';
          }
          if (idKind) {
            if (!ids.has(idKind)) ids.set(idKind, new Set());
            unique(ids.get(idKind), value, 'duplicate-' + idKind, part, idKind);
            if (value && !(idKind === 'paraId' ? /^[0-9a-f]{8}$/i : /^\d+$/).test(value))
              add('invalid-' + idKind, part, value, idKind + ' has an invalid value.');
          }
          if (ns === OFFICE_NS.word && name === 'comment')
            unique(commentIds, node.getAttributeNS(OFFICE_NS.word, 'id'), 'duplicate-comment-id', part, 'Comment id');
          if (ns === OFFICE_NS.word && ['commentRangeStart', 'commentRangeEnd', 'commentReference'].includes(name)) {
            countMetadata(); commentRefs.push({ part, id: node.getAttributeNS(OFFICE_NS.word, 'id') });
          }
        },
        text(value, node) {
          if (node?.namespaceURI === OFFICE_NS.word && node.localName === 't' && /^\s|\s$/.test(value) &&
              node.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'space') !== 'preserve')
            add('text-space', part, '', 'Word text has edge whitespace without xml:space="preserve".', 'warning');
        },
      });
    } catch (error) {
      if (/exceeds the check limit|exceeded 1000 findings/.test(String(error.message))) throw error;
      add('malformed-xml', part, '', 'Invalid XML in ' + part + ': ' + String(error.message).slice(0, 300));
    }
  }
  const contentType = name => overrides.get(name) || defaults.get(name.split('.').pop().toLowerCase());
  if (!names.has('[Content_Types].xml')) add('missing-content-types', '[Content_Types].xml', '', 'The package has no content type declarations.');
  for (const name of names) {
    if (name === '[Content_Types].xml' || name.endsWith('/')) continue;
    if (!contentType(name)) add('missing-content-type', name, '', 'The part has no content type.');
  }
  for (const name of overrides.keys()) if (!names.has(name))
    add('missing-override-part', '[Content_Types].xml', name, 'A content type Override points to a missing part.');
  if (names.has(officeMainParts[format]) && contentType(officeMainParts[format]) && contentType(officeMainParts[format]) !== officeMainTypes[format])
    add('main-content-type', officeMainParts[format], '', 'The main content type does not match the requested Office format.');
  for (const [owner, rels] of relationships) {
    if (owner && !names.has(owner)) add('missing-relationship-owner', owner, '', 'Relationships belong to a missing part.');
    for (const [id, rel] of rels) {
      if (rel.mode === 'External') continue;
      try {
        const target = officePartTarget(owner, rel.target);
        if (!names.has(target)) add('dangling-relationship', owner, id, 'Relationship ' + id + ' targets missing part ' + target + '.');
      } catch (error) { add('invalid-target', owner, id, String(error.message)); }
    }
  }
  const rootRels = relationships.get('');
  if (!rootRels || !Array.from(rootRels.values()).some(rel =>
      rel.type === OFFICE_NS.relationship + '/officeDocument' && rel.mode !== 'External' && (() => {
        try { return officePartTarget('', rel.target) === officeMainParts[format]; } catch { return false; }
      })())) add('missing-document-relationship', '_rels/.rels', '', 'The package must point to its main Office part.');
  for (const [part, refs] of references) for (const id of refs)
    if (!relationships.get(part)?.has(id)) add('unknown-relationship', part, id, 'XML references missing relationship ' + id + '.');
  for (const ref of commentRefs) if (!commentIds.has(ref.id))
    add('missing-comment', ref.part, ref.id || '', 'A comment anchor has no comment definition.');
  return findings;
}
function checkOfficePackage(bytes, format, original) {
  const before = original ? collectOfficeFindings(original, format) : [];
  const beforeKeys = new Set(before.map(item => item.key));
  const all = collectOfficeFindings(bytes, format);
  const findings = original ? all.filter(item => !beforeKeys.has(item.key)) : all;
  return {
    findings,
    compared: !!original,
    existing: all.length - findings.length,
    errors: findings.filter(item => item.severity === 'error').length,
    warnings: findings.filter(item => item.severity === 'warning').length,
  };
}
function assertOfficePackage(bytes, format, original) {
  const result = checkOfficePackage(bytes, format, original);
  if (result.errors) {
    const first = result.findings.find(item => item.severity === 'error');
    throw new Error('Office package check failed (' + first.rule + ', ' + first.part + '): ' + first.message +
      (result.errors > 1 ? ' ' + result.errors + ' errors in total.' : ''));
  }
}
`;
