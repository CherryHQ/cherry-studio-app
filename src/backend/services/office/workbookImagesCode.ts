// Adds standard, editable DrawingML image anchors to a newly generated SheetJS workbook.
// Existing workbooks use the patch-copy editor; they never round-trip through SheetJS.
export const workbookImagesCode = String.raw`
const parts = zip.unzipSync(new Uint8Array(result));
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const parse = text => new xml.DOMParser({ onError: (level, message) => { throw new Error(message); } }).parseFromString(text, 'application/xml');
const write = (path, doc) => { parts[path] = zip.strToU8(new xml.XMLSerializer().serializeToString(doc)); };
const types = parse(zip.strFromU8(parts['[Content_Types].xml']));
let imageNumber = 0;
for (const [sheetIndex, input] of spec.sheets.entries()) {
  if (!input.images?.length) continue;
  const sheetNumber = sheetIndex + 1;
  const drawingPath = 'xl/drawings/drawing' + sheetNumber + '.xml';
  const anchors = [], relations = [];
  for (const picture of input.images) {
    const image = images[picture.file_entry_id];
    const extension = image.mediaType === 'image/png' ? 'png' : 'jpeg';
    const name = 'image' + (++imageNumber) + '.' + extension;
    parts['xl/media/' + name] = readInput(image.index);
    const ref = /^([A-Z]+)([1-9][0-9]*)$/.exec(picture.cell);
    let column = 0;
    for (const char of ref[1]) column = column * 26 + char.charCodeAt(0) - 64;
    const row = Number(ref[2]);
    if (column > 16384 || row > 1048576) throw new Error('Image anchor is outside the Excel grid.');
    const id = 'rId' + imageNumber;
    const width = picture.width_px * 9525, height = picture.height_px * 9525;
    anchors.push('<xdr:oneCellAnchor><xdr:from><xdr:col>' + (column - 1) + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + (row - 1) + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="' + width + '" cy="' + height + '"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + imageNumber + '" name="' + name + '" descr="' + escape(picture.alt || '') + '"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + width + '" cy="' + height + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>');
    relations.push('<Relationship Id="' + id + '" Type="' + R + '/image" Target="../media/' + name + '"/>');
    if (!Array.from(types.getElementsByTagNameNS(CT, 'Default')).some(type => type.getAttribute('Extension') === extension)) {
      const type = types.createElementNS(CT, 'Default'); type.setAttribute('Extension', extension); type.setAttribute('ContentType', image.mediaType); types.documentElement.appendChild(type);
    }
  }
  parts[drawingPath] = zip.strToU8('<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="' + R + '">' + anchors.join('') + '</xdr:wsDr>');
  parts['xl/drawings/_rels/drawing' + sheetNumber + '.xml.rels'] = zip.strToU8('<Relationships xmlns="' + REL + '">' + relations.join('') + '</Relationships>');
  const sheetPath = 'xl/worksheets/sheet' + sheetNumber + '.xml';
  const sheet = parse(zip.strFromU8(parts[sheetPath]));
  const drawing = sheet.createElementNS(sheet.documentElement.namespaceURI, 'drawing');
  drawing.setAttributeNS(R, 'r:id', 'rIdCherryDrawing');
  const successors = ['legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];
  sheet.documentElement.insertBefore(drawing, Array.from(sheet.documentElement.childNodes).find(n => n.nodeType === 1 && successors.includes(n.localName)) || null);
  write(sheetPath, sheet);
  const relPath = 'xl/worksheets/_rels/sheet' + sheetNumber + '.xml.rels';
  const rels = parse(parts[relPath] ? zip.strFromU8(parts[relPath]) : '<Relationships xmlns="' + REL + '"/>');
  if (Array.from(rels.getElementsByTagNameNS(REL, 'Relationship')).some(r => r.getAttribute('Id') === 'rIdCherryDrawing')) throw new Error('Duplicate generated drawing relationship.');
  const rel = rels.createElementNS(REL, 'Relationship'); rel.setAttribute('Id', 'rIdCherryDrawing'); rel.setAttribute('Type', R + '/drawing'); rel.setAttribute('Target', '../drawings/drawing' + sheetNumber + '.xml'); rels.documentElement.appendChild(rel); write(relPath, rels);
  const type = types.createElementNS(CT, 'Override'); type.setAttribute('PartName', '/' + drawingPath); type.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.drawing+xml'); types.documentElement.appendChild(type);
}
write('[Content_Types].xml', types);
return saveOffice(zip.zipSync(parts, { level: 6 }), 'xlsx');
`;
