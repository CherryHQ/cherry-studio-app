import { parseOvisAnswer, parseOvisOcrOutput } from '../ovisOcrOutput';

test('retains prose, formulas and exact HTML cell text with merged row and column origins', () => {
  const raw =
    'Before\n<table><tbody>' +
    '<tr><th rowspan=2 colspan="2">A &amp; B<br>001</th><td>12.00</td></tr>' +
    '<tr><td>&#x4E2D;&#25991;</td></tr></tbody></table>\nAfter\n$$x^2$$';
  const result = parseOvisOcrOutput(raw);
  expect(result.text).toBe(raw);
  expect(result.invalidStructure).toBe(false);
  expect(result.formulas).toEqual(['x^2']);
  expect(result.tables).toEqual([
    {
      rowCount: 2,
      columnCount: 3,
      cells: [
        { text: 'A & B\n001', row: 0, column: 0, rows: 2, columns: 2 },
        { text: '12.00', row: 0, column: 2, rows: 1, columns: 1 },
        { text: '中文', row: 1, column: 2, rows: 1, columns: 1 },
      ],
    },
  ]);
});

test.each([
  '<table><tr><td>unfinished',
  '<table><tr><td>A</tr></table>',
  '<table><tr><td rowspan="2">outside</td></tr></table>',
  '<table><tr><td colspan="1000000">oversize</td></tr></table>',
  '<table><tr><td colspan="0">invalid</td></tr></table>',
  '<table><tr><td>A</td><td rowspan="2">B</td></tr><tr><td colspan="2">overlap</td></tr></table>',
  '<table><tr><td><table><tr><td>nested</td></tr></table></td></tr></table>',
])('retains malformed or unsupported table content without inventing a valid grid: %s', (raw) => {
  expect(parseOvisOcrOutput(raw)).toMatchObject({ text: raw, tables: [], invalidStructure: true });
});

test('keeps independent tables separate and ignores fenced examples', () => {
  const first = '<table><tr><td>A</td></tr></table>';
  const second = '<table><tr><td>B</td></tr></table>';
  const result = parseOvisOcrOutput(
    `${first}\n\nNext\n${second}\n\n\`\`\`text\n<table>example\n\`\`\``,
  );
  expect(result.tables.map((table) => table.cells[0]!.text)).toEqual(['A', 'B']);
  expect(result.invalidStructure).toBe(false);
  expect(parseOvisOcrOutput(`\`\`\`html\n${first}\n\`\`\``).tables).toHaveLength(1);
});

test('removes only generated crop references and flags repeated-tail cleanup as incomplete', () => {
  const text = 'Before <img src="images/bbox_1_2_3_4.jpg" /> After';
  expect(parseOvisOcrOutput(text).text).toBe('Before  After');
  const prefix = 'Document text\n'.repeat(620);
  expect(parseOvisOcrOutput(prefix + 'END'.repeat(100))).toMatchObject({
    text: prefix + 'END',
    truncated: true,
  });
});

test('extracts the final boxed answer with nested LaTeX braces, rejecting an unfinished answer', () => {
  expect(parseOvisAnswer('Reasoning. \\boxed{0012}')).toBe('0012');
  expect(parseOvisAnswer('First \\boxed{x}, final \\boxed{\\frac{1}{2}}')).toBe('\\frac{1}{2}');
  expect(parseOvisAnswer('Reasoning only')).toBeUndefined();
  expect(parseOvisAnswer('Answer \\boxed{unfinished')).toBeUndefined();
});
