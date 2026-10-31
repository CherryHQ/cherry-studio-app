import { extractAnydocContent } from '../extractAnydocContent';

test('retains an Office IR and locates table origins around row and column spans', () => {
  const ir = {
    version: 2,
    extension: { preserved: true },
    pages: [
      {
        blocks: [
          {
            type: 'table',
            rows: [
              [
                { paragraphs: [[{ text: '001' }]], rowSpan: 2, colSpan: 2 },
                { paragraphs: [[{ text: 'A' }]] },
              ],
              [{ paragraphs: [[{ text: '12.00' }]] }],
            ],
          },
        ],
      },
    ],
  };
  const original = JSON.stringify(ir);
  const { units } = extractAnydocContent(ir, 'tables');
  expect(units[0]).toMatchObject({
    location: { pointer: '/pages/0/blocks/0' },
    engine: 'anydoc',
    status: 'complete',
    tables: [
      {
        rowCount: 2,
        columnCount: 3,
        cells: [
          { text: '001', row: 0, column: 0, rows: 2, columns: 2 },
          { text: 'A', row: 0, column: 2, rows: 1, columns: 1 },
          { text: '12.00', row: 1, column: 2, rows: 1, columns: 1 },
        ],
      },
    ],
  });
  expect(units[0]!.location.page).toBeUndefined();
  expect(JSON.stringify(ir)).toBe(original);
});

test('does not invent a grid for out-of-bounds spans and retains the original block', () => {
  const block = { type: 'table', rows: [[{ paragraphs: [[{ text: 'A' }]], rowSpan: 1001 }]] };
  const { units } = extractAnydocContent({ pages: [{ blocks: [block] }] }, 'tables');
  expect(units[0]).toMatchObject({
    status: 'invalid-structure',
    tables: [],
    raw: JSON.stringify(block),
  });
});

test('extracts native math runs without interpreting ordinary prose as formulas', () => {
  const { units } = extractAnydocContent(
    {
      pages: [
        {
          blocks: [
            { type: 'paragraph', runs: [{ text: 'Price: $12' }, { text: 'x^2', math: true }] },
          ],
        },
      ],
    },
    'formulas',
  );
  expect(units[0]!.formulas).toEqual(['x^2']);
});

test('retains unknown blocks without presenting their empty text projection as complete', () => {
  const block = { type: 'future-chart', data: ['preserve me'] };
  const { units } = extractAnydocContent({ pages: [{ blocks: [block] }] }, 'document');
  expect(units[0]).toMatchObject({ status: 'unrecognized', raw: JSON.stringify(block) });
});
