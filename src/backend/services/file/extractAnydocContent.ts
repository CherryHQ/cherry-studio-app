import type {
  DocumentExtractionOptions,
  DocumentExtractionUnit,
  ExtractedTable,
} from '@/shared/contracts/documentExtraction';
import type { DocumentJsonValue } from '@/shared/contracts/fileAttachment';

type JsonObject = { [key: string]: DocumentJsonValue };
const object = (value: DocumentJsonValue | undefined): JsonObject | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;

function runsText(value: DocumentJsonValue | undefined): string {
  return Array.isArray(value)
    ? value
        .map((run) => {
          const text = object(run)?.text;
          return typeof text === 'string' ? text : '';
        })
        .join('')
    : '';
}

/** AnyDoc v2 omits covered cells; origins advance to the next unoccupied grid position. */
function readTable(rows: DocumentJsonValue | undefined): ExtractedTable | undefined {
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000) return undefined;
  const cells: ExtractedTable['cells'] = [];
  const occupied = new Set<number>();
  let columnCount = 0;
  for (const [row, source] of rows.entries()) {
    if (!Array.isArray(source)) return undefined;
    let column = 0;
    for (const entry of source) {
      const cell = object(entry);
      if (!cell) return undefined;
      while (occupied.has(row * 1000 + column)) column++;
      const rowSpan = cell.rowSpan ?? 1;
      const columnSpan = cell.colSpan ?? 1;
      if (
        typeof rowSpan !== 'number' ||
        typeof columnSpan !== 'number' ||
        !Number.isInteger(rowSpan) ||
        !Number.isInteger(columnSpan) ||
        rowSpan < 1 ||
        columnSpan < 1 ||
        row + rowSpan > rows.length ||
        column + columnSpan > 1000 ||
        cells.length >= 20_000
      )
        return undefined;
      for (let r = row; r < row + rowSpan; r++) {
        for (let c = column; c < column + columnSpan; c++) {
          const key = r * 1000 + c;
          if (occupied.has(key) || occupied.size >= 100_000) return undefined;
          occupied.add(key);
        }
      }
      cells.push({
        row,
        column,
        rows: rowSpan,
        columns: columnSpan,
        text: Array.isArray(cell.paragraphs) ? cell.paragraphs.map(runsText).join('\n') : '',
      });
      column += columnSpan;
      columnCount = Math.max(columnCount, column);
    }
  }
  if (!cells.length) return undefined;
  return { rowCount: rows.length, columnCount, cells };
}

/** A read view only: the caller separately retains the untouched IR, including unknown blocks. */
export function extractAnydocContent(
  ir: DocumentJsonValue,
  task: DocumentExtractionOptions['task'],
) {
  const pages = object(ir)?.pages;
  const units: DocumentExtractionUnit[] = [];
  let truncated = false;
  if (!Array.isArray(pages)) return { units, truncated: true };
  for (const [pageIndex, page] of pages.entries()) {
    const blocks = object(page)?.blocks;
    if (!Array.isArray(blocks)) {
      truncated = true;
      continue;
    }
    for (const [blockIndex, value] of blocks.entries()) {
      if (units.length >= 200) {
        truncated = true;
        break;
      }
      const block = object(value);
      if (!block) {
        truncated = true;
        continue;
      }
      const table = block.type === 'table' ? readTable(block.rows) : undefined;
      const formulas: string[] = [];
      const collectMath = (runs: DocumentJsonValue | undefined) => {
        if (!Array.isArray(runs)) return;
        for (const run of runs) {
          const value = object(run);
          if (value?.math === true && typeof value.text === 'string') formulas.push(value.text);
        }
      };
      collectMath(block.runs);
      if (Array.isArray(block.rows)) {
        for (const row of block.rows) {
          if (!Array.isArray(row)) continue;
          for (const cell of row) {
            const paragraphs = object(cell)?.paragraphs;
            if (Array.isArray(paragraphs)) paragraphs.forEach(collectMath);
          }
        }
      }
      if (task === 'tables' && block.type !== 'table') continue;
      if (task === 'formulas' && !formulas.length) continue;
      units.push({
        location: { pointer: `/pages/${pageIndex}/blocks/${blockIndex}` },
        engine: 'anydoc',
        status:
          block.type === 'table'
            ? table
              ? 'complete'
              : 'invalid-structure'
            : block.type === 'paragraph' && Array.isArray(block.runs)
              ? 'complete'
              : 'unrecognized',
        text: runsText(block.runs),
        raw: JSON.stringify(value),
        tables: table ? [table] : [],
        formulas,
      });
    }
    if (truncated) break;
  }
  return { units, truncated };
}
