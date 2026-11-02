import { DOMParser, type Element, type Node } from '@xmldom/xmldom';

import { extractedTableSchema, type ExtractedTable } from '@/shared/contracts/documentExtraction';

import { extractOcrFormulas } from './localOcrOutput';

function cellText(cell: Element): string {
  const parts: string[] = [];
  const pending: (Node | string)[] = Array.from(cell.childNodes).toReversed();
  while (pending.length) {
    const node = pending.pop()!;
    if (typeof node === 'string') parts.push(node);
    else if (node.nodeType === 3) parts.push(node.nodeValue ?? '');
    else if (node.nodeType === 1) {
      const tag = (node as Element).localName?.toLowerCase();
      if (tag === 'br' || tag === 'p' || tag === 'div') parts.push('\n');
      if (tag === 'p' || tag === 'div') pending.push('\n');
      pending.push(...Array.from(node.childNodes).toReversed());
    }
  }
  return parts.join('').trim();
}

/** Parse HTML as data only. Never repair malformed spans into a different table. */
function parseTable(source: string): ExtractedTable | undefined {
  try {
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) return undefined;
    const root = new DOMParser({
      onError: (level, message) => {
        // xmldom warns about valid unquoted HTML attributes; other repairs are not accepted.
        if (level === 'warning' && /^attribute "[^]*" missed quot\("\)!!?$/.test(message)) return;
        throw new Error('Malformed OCR table');
      },
    }).parseFromString(source, 'text/html').documentElement;
    if (!root || root.getElementsByTagName('table').length) return undefined;
    const rows = Array.from(root.getElementsByTagName('tr'));
    if (!rows.length || rows.length > 1000) return undefined;
    const occupied = new Set<number>();
    const cells: ExtractedTable['cells'] = [];
    let columnCount = 0;
    for (const [row, element] of rows.entries()) {
      const parent = (element.parentNode as Element).localName?.toLowerCase();
      if (!parent || !['table', 'thead', 'tbody', 'tfoot'].includes(parent)) return undefined;
      let column = 0;
      for (const node of Array.from(element.childNodes)) {
        if (node.nodeType !== 1) {
          if (node.nodeType === 3 && node.nodeValue?.trim()) return undefined;
          continue;
        }
        const cell = node as Element;
        if (!['th', 'td'].includes(cell.localName?.toLowerCase() ?? '')) return undefined;
        while (occupied.has(row * 1000 + column)) column++;
        const span = (attribute: string) => {
          const value = cell.getAttribute(attribute);
          return value === null ? 1 : /^\d+$/.test(value) ? Number(value) : NaN;
        };
        const rowSpan = span('rowspan');
        const columnSpan = span('colspan');
        if (
          !Number.isSafeInteger(rowSpan) ||
          !Number.isSafeInteger(columnSpan) ||
          rowSpan < 1 ||
          columnSpan < 1 ||
          row + rowSpan > rows.length ||
          column + columnSpan > 1000 ||
          cells.length >= 20_000 ||
          occupied.size + rowSpan * columnSpan > 100_000
        )
          return undefined;
        for (let r = row; r < row + rowSpan; r++) {
          for (let c = column; c < column + columnSpan; c++) {
            const key = r * 1000 + c;
            if (occupied.has(key)) return undefined;
            occupied.add(key);
          }
        }
        cells.push({ text: cellText(cell), row, column, rows: rowSpan, columns: columnSpan });
        column += columnSpan;
        columnCount = Math.max(columnCount, column);
      }
    }
    const table = extractedTableSchema.safeParse({ rowCount: rows.length, columnCount, cells });
    return table.success ? table.data : undefined;
  } catch {
    return undefined;
  }
}

// Ovis' recommended repeated-tail cleanup. Keep raw output and mark cleaned results incomplete.
function cleanRepeatedTail(text: string): string {
  if (text.length < 8000) return text;
  for (let period = 1; period <= 200; period++) {
    let start = text.length - 1;
    while (start >= period && text[start] === text[start - period]) start--;
    const length = text.length - 1 - start + period;
    if (length >= 100 && Math.floor(length / period) >= 5)
      return (
        text.slice(0, text.length - length + period) + text.slice(text.length - (length % period))
      );
  }
  return text;
}

/** Markdown remains the reading representation; validated HTML cells feed existing Office tools. */
export function parseOvisOcrOutput(raw: string) {
  const markdown = raw.trim();
  const cleaned = cleanRepeatedTail(markdown);
  // These are proposed source-image crops, not files produced by inference.
  const text = cleaned
    .replace(/<img\s+src="images\/bbox_\d+_\d+_\d+_\d+\.jpg"\s*\/?\s*>/g, '')
    .trim();
  const tables: ExtractedTable[] = [];
  let invalidStructure = false;
  // Ignore code examples, but allow a model to wrap its entire answer in a Markdown/HTML fence.
  const content = text.replace(/^```(?:markdown|html)\s*\n([^]*?)\n```$/, '$1');
  const prose = content.replace(/(^|\n)(`{3,}|~{3,})[^\n]*\n[^]*?\n\2(?=\s|$)/g, '');
  const remainder = prose.replace(/<table\b[^>]*>[^]*?<\/table\s*>/gi, (source) => {
    const table = parseTable(source);
    if (table && tables.length < 100) tables.push(table);
    else invalidStructure = true;
    return '';
  });
  if (/<\/?(?:table|thead|tbody|tfoot|tr|td|th)\b/i.test(remainder)) invalidStructure = true;
  return {
    text: content,
    tables,
    formulas: extractOcrFormulas(prose),
    invalidStructure,
    truncated: cleaned !== markdown,
  };
}

/** The trained VQA prompt puts its answer in a box; balance braces so LaTeX stays intact. */
export function parseOvisAnswer(raw: string): string | undefined {
  const marker = '\\boxed{';
  const start = raw.lastIndexOf(marker);
  if (start < 0) return undefined;
  let depth = 1;
  for (let index = start + marker.length; index < raw.length; index++) {
    if (raw[index] === '\\') {
      index++;
      continue;
    }
    if (raw[index] === '{') depth++;
    if (raw[index] === '}' && --depth === 0)
      return raw.slice(start + marker.length, index).trim() || undefined;
  }
  return undefined;
}
