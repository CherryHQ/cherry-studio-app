/** Structural inventories reuse the patcher's bounded package reader; they never rewrite a file. */
export const officeInventoryCode = String.raw`
function relatedPart(owner, type) {
  const path = relationPath(owner);
  if (!parts[path]) return undefined;
  const matches = all(document(path), REL, 'Relationship').filter(node => node.getAttribute('Type') === R + '/' + type && node.getAttribute('TargetMode') !== 'External');
  return matches.length === 1 ? relationship(owner, matches[0].getAttribute('Id'), type) : undefined;
}
function wordInventory() {
  const body = one(checkRoot('word/document.xml', W, 'document'), W, 'body');
  const items = [];
  let paragraph = 0, table = 0;
  const excerpt = node => all(node, W, 't').map(item => item.textContent).join(' ').slice(0, 500);
  for (const node of Array.from(body.childNodes).filter(node => node.nodeType === 1)) {
    if (node.namespaceURI !== W) continue;
    if (node.localName === 'p') {
      const paraId = node.getAttributeNS('http://schemas.microsoft.com/office/word/2010/wordml', 'paraId');
      const style = all(node, W, 'pStyle')[0]?.getAttributeNS(W, 'val');
      items.push({ id: 'p' + (paragraph + 1), kind: 'paragraph', part: 'word/document.xml',
        text: paragraphText(node, W).slice(0, 500), ...(style ? { style } : {}),
        anchor: { format: 'docx', paragraph: paragraph++, ...(paraId ? { paraId } : {}) } });
    } else if (node.localName === 'tbl') {
      const rows = children(node, W, 'tr');
      items.push({ id: 't' + (++table), kind: 'table', part: 'word/document.xml', text: excerpt(node),
        rows: rows.length, columns: Math.max(0, ...rows.map(row => children(row, W, 'tc').length)),
        merged_cells: all(node, W, 'gridSpan').length + all(node, W, 'vMerge').length });
    } else if (node.localName === 'sdt') {
      items.push({ id: 'control' + (items.length + 1), kind: 'content_control', part: 'word/document.xml', text: excerpt(node) });
    }
  }
  const sections = [['word/document.xml', 'body']];
  const relPath = relationPath('word/document.xml');
  if (parts[relPath]) for (const rel of all(document(relPath), REL, 'Relationship')) {
    const type = rel.getAttribute('Type')?.slice(R.length + 1);
    if (['header', 'footer', 'footnotes', 'endnotes', 'comments'].includes(type) && rel.getAttribute('TargetMode') !== 'External')
      sections.push([relationship('word/document.xml', rel.getAttribute('Id'), type), type]);
  }
  const seen = new Set();
  for (const [path, section] of sections) {
    if (seen.has(path)) continue;
    seen.add(path);
    const root = document(path).documentElement;
    if (section === 'header' || section === 'footer') items.push({ id: path, kind: section, part: path, text: excerpt(root) });
    for (const kind of ['footnote', 'endnote', 'comment']) for (const node of all(root, W, kind)) {
      const id = node.getAttributeNS(W, 'id') || '';
      // Negative/zero notes can be separator records rather than authored text.
      items.push({ id: kind + ':' + id, kind, part: path, text: excerpt(node),
        ...(node.getAttributeNS(W, 'author') ? { author: node.getAttributeNS(W, 'author') } : {}) });
    }
    for (const kind of ['ins', 'del', 'moveFrom', 'moveTo', 'rPrChange', 'pPrChange']) for (const node of all(root, W, kind))
      items.push({ id: kind + ':' + (node.getAttributeNS(W, 'id') || items.length), kind: 'change', part: path,
        change_type: kind, text: [...all(node, W, 't'), ...all(node, W, 'delText')].map(item => item.textContent).join(' ').slice(0, 500),
        ...(node.getAttributeNS(W, 'author') ? { author: node.getAttributeNS(W, 'author') } : {}) });
    for (const node of [...all(root, W, 'fldSimple'), ...all(root, W, 'instrText')])
      items.push({ id: 'field:' + items.length, kind: 'field', part: path,
        text: (node.getAttributeNS(W, 'instr') || node.textContent).slice(0, 500) });
  }
  return { kind: 'structure', total: items.length, offset: request.offset,
    items: items.slice(request.offset, request.offset + request.limit) };
}
function workbookInventory() {
  request.finding_offset ??= 0;
  const list = sheets(), selected = list.slice(request.offset, request.offset + request.limit);
  const findings = [];
  let findingTotal = 0;
  const report = finding => {
    if (findingTotal >= request.finding_offset && findings.length < 100) findings.push(finding);
    findingTotal++;
  };
  const items = selected.map(sheet => {
    const name = sheet.getAttribute('name'), path = sheetPath(name);
    const result = { sheet: name, state: sheet.getAttribute('state') || 'visible', range: '',
      cells: 0, formulas: 0, cached_formulas: 0, error_cells: 0, uncached_formulas: 0, merges: 0, tables: 0, charts: 0 };
    let cell, valueTag, formulaTag;
    // The inventory needs counts and cached formula facts, not a worksheet-sized DOM.
    scanOfficeXml(parts[path], {
      start(node) {
        if (node.namespaceURI !== S) return;
        const tag = node.localName;
        if (tag === 'dimension') result.range = node.getAttribute('ref') || '';
        else if (tag === 'mergeCell') result.merges++;
        else if (tag === 'tablePart') result.tables++;
        else if (tag === 'c') { result.cells++; cell = { address: node.getAttribute('r') || '', type: node.getAttribute('t') || 'n', formula: '', value: '', formulaCell: false, cached: false }; }
        else if (cell && tag === 'f') { cell.formulaCell = true; formulaTag = node; }
        else if (cell && tag === 'v') { cell.cached = true; valueTag = node; }
      },
      text(text, node) {
        if (cell && node === formulaTag) cell.formula = (cell.formula + text).slice(0, 2000);
        if (cell && node === valueTag) cell.value = (cell.value + text).slice(0, 500);
      },
      end(node) {
        if (node === formulaTag) formulaTag = undefined;
        if (node === valueTag) valueTag = undefined;
        if (node.namespaceURI !== S || node.localName !== 'c' || !cell) return;
        // An empty string is a valid cached string result, but an empty numeric <v/> is not.
        const cached = cell.cached && (cell.type === 'str' || cell.value !== '');
        if (cell.formulaCell) {
          result.formulas++;
          if (cached) result.cached_formulas++;
          else { result.uncached_formulas++; report({ sheet: name, cell: cell.address, kind: 'uncached_formula', formula: cell.formula }); }
        }
        if (cell.type === 'e') { result.error_cells++; report({ sheet: name, cell: cell.address, kind: 'error', value: cell.value, ...(cell.formulaCell ? { formula: cell.formula } : {}) }); }
        cell = undefined;
      },
    });
    const drawing = relatedPart(path, 'drawing');
    if (drawing && parts[drawing]) result.charts = all(document(drawing), 'http://schemas.openxmlformats.org/drawingml/2006/chart', 'chart').length;
    return result;
  });
  return { kind: 'structure', total: list.length, offset: request.offset, items,
    findings: { total: findingTotal, offset: request.finding_offset, items: findings },
    formula_values: 'saved-cache-only' };
}
function multiplyMatrix(left, right) {
  return [left[0]*right[0]+left[2]*right[1], left[1]*right[0]+left[3]*right[1],
    left[0]*right[2]+left[2]*right[3], left[1]*right[2]+left[3]*right[3],
    left[0]*right[4]+left[2]*right[5]+left[4], left[1]*right[4]+left[3]*right[5]+left[5]];
}
function transformBox(node) {
  if (!node) return undefined;
  const off = children(node, A, 'off')[0], ext = children(node, A, 'ext')[0];
  if (!off || !ext) return undefined;
  const box = { x: Number(off.getAttribute('x')), y: Number(off.getAttribute('y')), width: Number(ext.getAttribute('cx')), height: Number(ext.getAttribute('cy')) };
  return Object.values(box).every(Number.isFinite) && box.width >= 0 && box.height >= 0 ? box : undefined;
}
function rotationMatrix(node, box) {
  const angle = Number(node.getAttribute('rot') || 0) / 60000 * Math.PI / 180;
  const flipX = ['1', 'true'].includes(node.getAttribute('flipH')) ? -1 : 1;
  const flipY = ['1', 'true'].includes(node.getAttribute('flipV')) ? -1 : 1;
  const cos = Math.cos(angle), sin = Math.sin(angle), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const matrix = [cos*flipX, sin*flipX, -sin*flipY, cos*flipY, 0, 0];
  matrix[4] = cx - matrix[0]*cx - matrix[2]*cy;
  matrix[5] = cy - matrix[1]*cx - matrix[3]*cy;
  return matrix;
}
function shapeTransform(node) {
  return children(node, P, 'xfrm')[0] || children(children(node, P, 'spPr')[0] || node, A, 'xfrm')[0];
}
function inheritedTransform(shape, path) {
  const placeholder = all(shape, P, 'ph')[0];
  if (!placeholder) return undefined;
  let current = placeholder;
  for (const type of ['slideLayout', 'slideMaster']) {
    path = relatedPart(path, type);
    if (!path || !parts[path]) return undefined;
    const candidates = all(document(path), P, 'ph').filter(candidate => current.hasAttribute('idx')
      ? candidate.getAttribute('idx') === current.getAttribute('idx')
      : (candidate.getAttribute('type') || 'obj') === (current.getAttribute('type') || 'obj'));
    if (candidates.length !== 1) return undefined;
    current = candidates[0];
    const transform = shapeTransform(current.parentNode.parentNode.parentNode);
    if (transformBox(transform)) return { transform, source: type === 'slideLayout' ? 'layout' : 'master' };
  }
  return undefined;
}
function resolvedShapeBox(shape, path) {
  const direct = shapeTransform(shape);
  const resolved = transformBox(direct) ? { transform: direct, source: 'shape' } : inheritedTransform(shape, path);
  if (!resolved) return undefined;
  const box = transformBox(resolved.transform);
  let matrix = rotationMatrix(resolved.transform, box);
  for (let parent = shape.parentNode; parent?.nodeType === 1; parent = parent.parentNode) {
    if (parent.namespaceURI !== P || parent.localName !== 'grpSp') continue;
    const transform = children(children(parent, P, 'grpSpPr')[0] || parent, A, 'xfrm')[0];
    const group = transformBox(transform);
    const childOff = transform && children(transform, A, 'chOff')[0], childExt = transform && children(transform, A, 'chExt')[0];
    if (!group || !childOff || !childExt) return undefined;
    const sx = group.width / Number(childExt.getAttribute('cx')), sy = group.height / Number(childExt.getAttribute('cy'));
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return undefined;
    const scale = [sx, 0, 0, sy, group.x - Number(childOff.getAttribute('x')) * sx, group.y - Number(childOff.getAttribute('y')) * sy];
    matrix = multiplyMatrix(multiplyMatrix(rotationMatrix(transform, group), scale), matrix);
  }
  const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
    .map(([x, y]) => [matrix[0]*x+matrix[2]*y+matrix[4], matrix[1]*x+matrix[3]*y+matrix[5]]);
  if (!corners.flat().every(Number.isFinite)) return undefined;
  const x = Math.min(...corners.map(point => point[0])), y = Math.min(...corners.map(point => point[1]));
  return { x: x/914400, y: y/914400, width: (Math.max(...corners.map(point => point[0]))-x)/914400,
    height: (Math.max(...corners.map(point => point[1]))-y)/914400, source: resolved.source };
}
function presentationInventory() {
  request.finding_offset ??= 0;
  const list = slides(), size = all(document('ppt/presentation.xml'), P, 'sldSz')[0];
  const width = size ? Number(size.getAttribute('cx'))/914400 : 0, height = size ? Number(size.getAttribute('cy'))/914400 : 0;
  const findings = [];
  let findingTotal = 0;
  const report = item => { if (findingTotal >= request.finding_offset && findings.length < 100) findings.push(item); findingTotal++; };
  const items = list.slice(request.offset, request.offset + request.limit).map((_, index) => {
    const slide = request.offset + index + 1, path = slidePath(slide), shapes = slideShapes(path);
    if (shapes.length > 2000) fail('A slide exceeds the 2000-shape inventory limit.');
    const geometry = shapes.map(shape => {
      const box = resolvedShapeBox(shape.node, path);
      const text = all(shape.node, A, 't').map(node => node.textContent).join(' ').slice(0, 500);
      return { nodeId: shape.id, name: all(shape.node, P, 'cNvPr')[0]?.getAttribute('name') || '', kind: shape.node.localName, text,
        ...(box ? { box } : {}), fonts: [...new Set(all(shape.node, A, 'latin').map(node => node.getAttribute('typeface')).filter(Boolean))].slice(0, 20),
        font_sizes: [...new Set([...all(shape.node, A, 'rPr'), ...all(shape.node, A, 'defRPr')].map(node => Number(node.getAttribute('sz'))/100).filter(size => Number.isFinite(size) && size > 0))].slice(0, 20) };
    });
    for (const shape of geometry) {
      const box = shape.box;
      if (!box) report({ slide, kind: 'unresolved_geometry', nodeIds: [shape.nodeId] });
      else if (width > 0 && height > 0 && (box.x < -0.01 || box.y < -0.01 || box.x+box.width > width+0.01 || box.y+box.height > height+0.01))
        report({ slide, kind: 'outside_slide', nodeIds: [shape.nodeId] });
    }
    const textShapes = geometry.filter(shape => shape.kind === 'sp' && shape.text.trim() && shape.box);
    for (let i = 0; i < textShapes.length; i++) for (let j = i + 1; j < textShapes.length; j++) {
      const a = textShapes[i].box, b = textShapes[j].box;
      if (Math.min(a.x+a.width, b.x+b.width)-Math.max(a.x,b.x) > 0.01 && Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y) > 0.01)
        report({ slide, kind: 'overlapping_text_boxes', nodeIds: [textShapes[i].nodeId, textShapes[j].nodeId] });
    }
    return { slide, shape_total: shapes.length, shape_offset: request.shape_offset, shapes: geometry.slice(request.shape_offset, request.shape_offset + 50) };
  });
  return { kind: 'structure', total: list.length, offset: request.offset, items, width, height, units: 'inches',
    findings: { total: findingTotal, offset: request.finding_offset, items: findings },
    layout: 'bounding-box-estimate; intentional overlaps need review; text overflow requires rendering', fonts: 'explicit-run-fonts' };
}
function inspectOfficeStructure() {
  if (request.format === 'docx') return wordInventory();
  if (request.format === 'xlsx') return workbookInventory();
  return presentationInventory();
}
`;
