export type TextBlockLimits = {
  /** Longest single row; a longer line continues in the next row. */
  maxLineLength: number;
  /** Characters per block, counting line breaks. */
  maxBlockLength: number;
  maxBlockLines: number;
};

/**
 * Splits text into bounded blocks for a virtualized reader. A native text view lays out and draws
 * its whole block at once, so neither its rows nor its row length may grow with the file. Joining
 * the blocks with line breaks restores the text, apart from the breaks inserted into long lines.
 */
export function splitTextBlocks(text: string, limits: TextBlockLimits): string[] {
  const blocks: string[] = [];
  let rows: string[] = [];
  let length = 0;
  const flush = () => {
    blocks.push(rows.join('\n'));
    rows = [];
    length = 0;
  };

  for (const line of text.split('\n')) {
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
