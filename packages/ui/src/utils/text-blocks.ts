export type TextBlockLimits = {
  /** Longest single row; a longer line continues in the next row. */
  maxLineLength: number;
  /** Characters per block, counting line breaks. */
  maxBlockLength: number;
  maxBlockLines: number;
};

const PLAIN_TEXT_LIMITS: TextBlockLimits = {
  maxBlockLength: 1000,
  maxBlockLines: 20,
  maxLineLength: 1000,
};

/**
 * Splits text into bounded blocks for a virtualized reader. A native text view lays out and draws
 * its whole block at once, so neither its rows nor its row length may grow with the file. Joining
 * the blocks with line breaks restores the text, apart from normalized line endings and breaks
 * inserted into long lines. Copy actions must use the original text.
 */
export function splitTextBlocks(
  text: string,
  limits: TextBlockLimits = PLAIN_TEXT_LIMITS,
): string[] {
  const blocks: string[] = [];
  let rows: string[] = [];
  let length = 0;
  const flush = () => {
    blocks.push(rows.join('\n'));
    rows = [];
    length = 0;
  };

  for (const line of text.split(/\r\n|[\n\r\v\f\u0085\u2028\u2029]/)) {
    for (const row of splitLine(line, limits.maxLineLength)) {
      if (
        rows.length > 0 &&
        (rows.length >= limits.maxBlockLines || length + row.length > limits.maxBlockLength)
      ) {
        flush();
      }
      rows.push(row);
      length += row.length + 1;
    }
  }
  flush();
  return blocks;
}

function splitLine(line: string, maxLength: number): string[] {
  if (line.length <= maxLength) return [line];
  const rows: string[] = [];
  for (let start = 0; start < line.length;) {
    let end = Math.min(start + maxLength, line.length);
    // Keep a surrogate pair in one row so neither half renders as a replacement character.
    if (end < line.length && isHighSurrogate(line.charCodeAt(end - 1))) end -= 1;
    rows.push(line.slice(start, end));
    start = end;
  }
  return rows;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
