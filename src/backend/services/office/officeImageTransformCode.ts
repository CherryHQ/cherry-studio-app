// Runs inside officeTransformCode's bounded ZIP/XML job and shares its package helpers.
export const officeImageTransformCode = String.raw`
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
function ancestor(node, ns, names) {
  for (let parent = node.parentNode; parent; parent = parent.parentNode)
    if (parent.namespaceURI === ns && names.includes(parent.localName)) return parent;
}
let pictures;
function officePictures() {
  if (pictures) return pictures;
  pictures = [];
  if (request.format === 'docx') {
    const path = 'word/document.xml';
    const body = one(checkRoot(path, W, 'document'), W, 'body');
    pictures = all(body, PIC, 'pic').map((node, image_index) => ({
      node, path, ns: PIC, anchor: { format: 'docx', image_index },
      frame: ancestor(node, WP, ['inline', 'anchor']),
    }));
  } else if (request.format === 'xlsx') {
    for (const sheet of sheets()) {
      const name = sheet.getAttribute('name');
      const sourcePath = sheetPath(name);
      const root = checkRoot(sourcePath, S, 'worksheet');
      let image_index = 0;
      for (const drawing of children(root, S, 'drawing')) {
        const path = relationship(sourcePath, drawing.getAttributeNS(R, 'id'), 'drawing');
        for (const node of all(checkRoot(path, XDR, 'wsDr'), XDR, 'pic')) pictures.push({
          node, path, ns: XDR, sheetRoot: root,
          anchor: { format: 'xlsx', sheet: name, image_index: image_index++ },
          frame: ancestor(node, XDR, ['oneCellAnchor', 'twoCellAnchor', 'absoluteAnchor']),
        });
      }
    }
  } else {
    for (let slide = 1; slide <= slides().length; slide++) {
      const path = slidePath(slide);
      for (const node of all(checkRoot(path, P, 'sld'), P, 'pic')) {
        const props = all(node, P, 'cNvPr');
        const nodeId = props.length === 1 ? props[0].getAttribute('id') : '';
        if (!/^\d+$/.test(nodeId)) fail('Picture shape has no unambiguous numeric id.');
        pictures.push({ node, path, ns: P, anchor: { format: 'pptx', slide, nodeId } });
      }
    }
  }
  return pictures;
}
function pictureKey(anchor) {
  return anchor.format === 'docx' ? 'docx:' + anchor.image_index
    : anchor.format === 'xlsx' ? JSON.stringify(['xlsx', anchor.sheet, anchor.image_index])
    : 'pptx:' + anchor.slide + ':' + anchor.nodeId;
}
function pictureReference(picture) {
  const { node, path, ns } = picture;
  if (officePictures().filter(other => other.node === node).length !== 1)
    fail('A shared drawing or slide cannot be changed without affecting another occurrence.');
  if (picture.anchor.format === 'pptx' && slideShapes(path).filter(shape => shape.id === picture.anchor.nodeId).length !== 1)
    fail('Picture shape id is ambiguous.');
  if (ancestor(node, MC, ['AlternateContent'])) fail('Pictures with alternate content are unsupported.');
  if (ancestor(node, W, ['ins', 'del', 'moveFrom', 'moveTo', 'sdt']))
    fail('Pictures inside tracked changes or content controls are unsupported.');
  if (picture.anchor.format !== 'pptx' && !picture.frame) fail('Picture has no supported drawing anchor.');
  if (picture.sheetRoot && children(picture.sheetRoot, S, 'sheetProtection').length)
    fail('Protected worksheets cannot be edited.');
  const fill = one(node, ns, 'blipFill');
  const blip = one(fill, A, 'blip');
  if (blip.hasAttributeNS(R, 'link') || !blip.getAttributeNS(R, 'embed'))
    fail('Linked or missing image references are unsupported.');
  if (Array.from(blip.childNodes).some(child => child.nodeType === 1))
    fail('Pictures with image effects, SVG alternatives or other image extensions are unsupported.');
  if (children(fill, A, 'tile').length) fail('Tiled picture fills are unsupported.');
  if (all(node, A, 'videoFile').length || all(node, A, 'audioFile').length || all(node, P, 'oleObj').length)
    fail('Media posters and embedded objects are not ordinary pictures.');
  const imagePath = relationship(path, blip.getAttributeNS(R, 'embed'), 'image');
  if (!parts[imagePath]) fail('Embedded image bytes are missing.');
  const types = checkRoot('[Content_Types].xml', CT, 'Types');
  const overrides = children(types, CT, 'Override').filter(type => type.getAttribute('PartName') === '/' + imagePath);
  const extension = imagePath.split('.').pop().toLowerCase();
  const defaults = children(types, CT, 'Default').filter(type => type.getAttribute('Extension').toLowerCase() === extension);
  const matches = overrides.length ? overrides : defaults;
  if (matches.length !== 1 || !['image/png', 'image/jpeg'].includes(matches[0].getAttribute('ContentType')))
    fail('Only existing embedded PNG/JPEG pictures can be replaced.');
  return { blip, mediaType: matches[0].getAttribute('ContentType') };
}
function inspectPictures() {
  const list = officePictures();
  return { kind: 'images', total: list.length, offset: request.offset,
    items: list.slice(request.offset, request.offset + request.limit).map(picture => {
      const properties = picture.frame && picture.anchor.format === 'docx'
        ? children(picture.frame, WP, 'docPr')[0] : all(picture.node, picture.ns, 'cNvPr')[0];
      const item = { anchor: picture.anchor, name: (properties?.getAttribute('name') || '').slice(0, 300),
        alt: (properties?.getAttribute('descr') || properties?.getAttribute('title') || '').slice(0, 300), replaceable: true };
      const ext = picture.frame && picture.anchor.format === 'docx' ? children(picture.frame, WP, 'extent')[0]
        : picture.frame && picture.anchor.format === 'xlsx' ? children(picture.frame, XDR, 'ext')[0] || all(picture.node, A, 'ext')[0]
        : all(picture.node, A, 'ext')[0];
      if (ext) {
        const width = Number(ext.getAttribute('cx')), height = Number(ext.getAttribute('cy'));
        if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
          item.width_px = width / 9525; item.height_px = height / 9525;
        }
      }
      if (picture.frame && picture.anchor.format === 'xlsx') {
        const from = children(picture.frame, XDR, 'from')[0];
        const col = from && children(from, XDR, 'col')[0]?.textContent;
        const row = from && children(from, XDR, 'row')[0]?.textContent;
        if (/^\d+$/.test(col || '') && /^\d+$/.test(row || '') && Number(col) < 16384 && Number(row) < 1048576)
          item.cell = address(Number(col) + 1, Number(row) + 1);
      }
      try { item.mediaType = pictureReference(picture).mediaType; }
      catch (error) { item.replaceable = false; item.reason = String(error.message || error).slice(0, 300); }
      return item;
    }) };
}
function replacePictures() {
  const replacements = request.images || [];
  const targets = new Set();
  const selected = replacements.map(change => {
    const key = pictureKey(change.anchor);
    if (targets.has(key)) fail('Duplicate image replacements.');
    targets.add(key);
    if (change.anchor.format !== request.format || request.format === 'xlsx' && change.anchor.sheet !== request.sheet)
      fail('Image anchor does not match the selected format or worksheet.');
    const matches = officePictures().filter(picture => pictureKey(picture.anchor) === key);
    if (matches.length !== 1) fail('Picture no longer exists or its anchor is ambiguous.');
    return { change, picture: matches[0], blip: pictureReference(matches[0]).blip };
  });
  const newParts = new Map();
  for (const { change, picture, blip } of selected) {
    const image = images[change.file_entry_id];
    if (!image || !['image/png', 'image/jpeg'].includes(image.mediaType)) fail('Replacement image is unavailable or unsupported.');
    let imagePath = newParts.get(change.file_entry_id);
    if (!imagePath) {
      const extension = image.mediaType === 'image/png' ? 'png' : 'jpeg';
      const prefix = request.format === 'docx' ? 'word' : request.format === 'xlsx' ? 'xl' : 'ppt';
      const types = checkRoot('[Content_Types].xml', CT, 'Types');
      const reserved = new Set(children(types, CT, 'Override').map(type => type.getAttribute('PartName')));
      let index = 1;
      do { imagePath = prefix + '/media/cherry-replacement-' + index++ + '.' + extension; }
      while (parts[imagePath] || reserved.has('/' + imagePath));
      parts[imagePath] = readInput(image.index);
      const type = freshElement(types, CT, 'Override');
      type.setAttribute('PartName', '/' + imagePath); type.setAttribute('ContentType', image.mediaType);
      types.appendChild(type); dirty.add('[Content_Types].xml'); newParts.set(change.file_entry_id, imagePath);
    }
    const relPath = relationPath(picture.path);
    const relations = checkRoot(relPath, REL, 'Relationships');
    const ids = new Set(children(relations, REL, 'Relationship').map(rel => rel.getAttribute('Id')));
    let index = 1, id;
    do { id = 'rIdCherryImage' + index++; } while (ids.has(id));
    const owner = picture.path.split('/').slice(0, -1), target = imagePath.split('/');
    while (owner.length && target.length && owner[0] === target[0]) { owner.shift(); target.shift(); }
    const relation = freshElement(relations, REL, 'Relationship');
    relation.setAttribute('Id', id); relation.setAttribute('Type', R + '/image');
    relation.setAttribute('Target', '../'.repeat(owner.length) + target.join('/'));
    relations.appendChild(relation); dirty.add(relPath);
    // Copy-on-write reference: other pictures may still use the original relationship/media.
    blip.setAttributeNS(R, blip.getAttributeNodeNS(R, 'embed').name, id);
    dirty.add(picture.path);
  }
}
`;
