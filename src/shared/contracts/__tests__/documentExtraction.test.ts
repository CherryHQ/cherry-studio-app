import {
  documentExtractionOptionsSchema,
  extractDocumentInputSchema,
  extractedTableSchema,
} from '../documentExtraction';

test.each([
  { task: 'fields' },
  { task: 'question' },
  { task: 'tables', question: 'Total?' },
  { task: 'fields', fields: ['id', 'id'] },
  { task: 'document', pages: [1, 1] },
  { task: 'document', pages: [101] },
  { task: 'document', pages: [1], assetRef: 'image.png' },
  { task: 'document', pages: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
])('rejects ambiguous or unbounded extraction options: %j', (options) => {
  expect(documentExtractionOptionsSchema.safeParse(options).success).toBe(false);
});

test('rejects out-of-bounds and overlapping cached table cells', () => {
  const cell = { text: '001', row: 0, column: 0, rows: 1, columns: 2 };
  const table = { rowCount: 1, columnCount: 2, cells: [cell] };
  expect(extractedTableSchema.safeParse(table).success).toBe(true);
  expect(extractedTableSchema.safeParse({ ...table, cells: [{ ...cell, rows: 2 }] }).success).toBe(
    false,
  );
  expect(
    extractedTableSchema.safeParse({ ...table, cells: [cell, { ...cell, column: 1, columns: 1 }] })
      .success,
  ).toBe(false);
});

test('accepts a bounded field request but never accepts a device path in place of an id', () => {
  const options = { task: 'fields', fields: ['invoice number', 'amount'], pages: [3] };
  expect(documentExtractionOptionsSchema.safeParse(options).success).toBe(true);
  expect(
    extractDocumentInputSchema.safeParse({ fileEntryId: 'file:///private/source.pdf', options })
      .success,
  ).toBe(false);
});
