import type { ExtractedTable } from '@/shared/contracts/documentExtraction';

type TableCell = ExtractedTable['cells'][number];

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** OTSL's origin/continuation tags describe a rectangular grid, including merged cells.
 * https://github.com/xiaomi-research/Xiaomi-OCR-0/blob/main/postprocess/otsl.py
 * Keep malformed model output verbatim instead of silently discarding document content.
 */
function parseTable(source: string): ExtractedTable | undefined {
  const rows = source
    .trim()
    .split('<nl>')
    .filter((row) => row.trim());
  const grid: TableCell[][] = [];
  const cells: TableCell[] = [];
  for (const [rowIndex, row] of rows.entries()) {
    if (!row.trim().startsWith('<')) return undefined;
    const chunks = [
      ...row.matchAll(/<(fcel|ecel|lcel|ucel|xcel)>([^]*?)(?=<(?:fcel|ecel|lcel|ucel|xcel)>|$)/g),
    ];
    if (
      !chunks.length ||
      chunks
        .map((chunk) => chunk[0])
        .join('')
        .trim() !== row.trim()
    )
      return undefined;
    const columns: TableCell[] = [];
    grid.push(columns);
    for (const [column, chunk] of chunks.entries()) {
      const tag = chunk[1];
      let cell: TableCell | undefined;
      if (tag === 'fcel' || tag === 'ecel') {
        cell = { text: chunk[2]!.trim(), row: rowIndex, column, rows: 1, columns: 1 };
        cells.push(cell);
      } else {
        if (chunk[2]!.trim()) return undefined;
        cell = tag === 'lcel' ? columns[column - 1] : grid[rowIndex - 1]?.[column];
        if (!cell || (tag === 'xcel' && columns[column - 1] !== cell)) return undefined;
        cell.rows = Math.max(cell.rows, rowIndex - cell.row + 1);
        cell.columns = Math.max(cell.columns, column - cell.column + 1);
      }
      columns.push(cell);
    }
    if (columns.length !== grid[0]!.length) return undefined;
  }
  if (!cells.length) return undefined;
  // Reject nonrectangular spans rather than inventing a different table.
  for (const cell of cells) {
    for (let row = cell.row; row < cell.row + cell.rows; row++) {
      for (let column = cell.column; column < cell.column + cell.columns; column++) {
        if (grid[row]?.[column] !== cell) return undefined;
      }
    }
  }
  return { rowCount: grid.length, columnCount: grid[0]!.length, cells };
}

function tableHtml(table: ExtractedTable): string {
  return (
    '<table>\n' +
    Array.from(
      { length: table.rowCount },
      (_, row) =>
        '<tr>' +
        table.cells
          .filter((cell) => cell.row === row)
          .map(
            (cell) =>
              `<td${cell.rows > 1 ? ` rowspan="${cell.rows}"` : ''}${cell.columns > 1 ? ` colspan="${cell.columns}"` : ''}>${escapeHtml(cell.text).replace(/\n/g, '<br>')}</td>`,
          )
          .join('') +
        '</tr>',
    ).join('\n') +
    '\n</table>'
  );
}

/** Keep the validated grid alongside its display form; malformed tables remain raw text. */
export function parseXiaomiOcrOutput(raw: string) {
  let inFence = false;
  let invalidStructure = false;
  const tables: ExtractedTable[] = [];
  const formulas: string[] = [];
  const prose: string[] = [];
  const text = raw
    .trim()
    .split(/(\n\s*\n)/)
    .map((block) => {
      const fences = block.match(/```/g)?.length ?? 0;
      const skip = inFence || fences > 0;
      if (fences % 2) inFence = !inFence;
      if (skip) return block;
      prose.push(block);
      // OTSL rows are consecutive tags. Stop at prose, so adjacent independent tables stay separate.
      const converted = block.replace(
        /<(?:fcel|ecel)>[^]*?<nl>(?:[ \t\r\n]*<(?:fcel|ecel|lcel|ucel|xcel)>[^]*?<nl>)*/g,
        (source) => {
          const table = parseTable(source);
          if (!table) {
            invalidStructure = true;
            return source;
          }
          tables.push(table);
          return tableHtml(table);
        },
      );
      // A cut-off OTSL fragment outside fenced source is not a successful empty extraction.
      if (/<(?:fcel|ecel|lcel|ucel|xcel|nl)>/.test(converted)) invalidStructure = true;
      return converted;
    })
    .join('');
  for (const match of prose
    .join('')
    .matchAll(
      /\$\$([^]*?)\$\$|\\\[([^]*?)\\\]|\\\(([^]*?)\\\)|(?<![\\$])\$(?!\$)([^$\n]+?)\$(?!\$)/g,
    )) {
    const formula = (match[1] ?? match[2] ?? match[3] ?? match[4])?.trim();
    if (formula) formulas.push(formula);
  }
  return { text, tables, formulas, invalidStructure };
}

/** Field values stay strings: parsing must not erase leading zeroes, units or decimal notation. */
export function parseXiaomiFields(
  raw: string,
  fields: readonly string[],
): Record<string, string | null> | undefined {
  try {
    const value: unknown = JSON.parse(
      raw
        .trim()
        .replace(/^```(?:json)?\s*\n?/, '')
        .replace(/\n?```$/, ''),
    );
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const object = value as Record<string, unknown>;
    if (Object.keys(object).some((key) => !fields.includes(key))) return undefined;
    if (
      fields.some(
        (field) =>
          !Object.hasOwn(object, field) ||
          (object[field] !== null && typeof object[field] !== 'string'),
      )
    )
      return undefined;
    return Object.fromEntries(
      fields.map((field) => [
        field,
        object[field] === '' ? null : (object[field] as string | null),
      ]),
    );
  } catch {
    return undefined;
  }
}
