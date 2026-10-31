import { parseXiaomiFields, parseXiaomiOcrOutput } from '../xiaomiOcrOutput';

test('converts table cells without discarding surrounding document prose', () => {
  expect(parseXiaomiOcrOutput('Before\n<fcel>A & B<fcel>2<nl>\nAfter').text).toBe(
    'Before\n<table>\n<tr><td>A &amp; B</td><td>2</td></tr>\n</table>\nAfter',
  );
});

test('retains a rectangular merged cell across rows and columns', () => {
  expect(
    parseXiaomiOcrOutput('<fcel>Merged<lcel><fcel>Top<nl><ucel><xcel><fcel>Bottom<nl>').text,
  ).toBe(
    '<table>\n<tr><td rowspan="2" colspan="2">Merged</td><td>Top</td></tr>\n<tr><td>Bottom</td></tr>\n</table>',
  );
});

test('retains malformed tables rather than dropping cells or changing their meaning', () => {
  for (const text of [
    '<fcel>A<lcel>unexpected text<nl>',
    '<fcel>A<fcel>B<nl><ucel><nl>',
    '<fcel>A<lcel><nl><ucel><fcel>B<nl>',
  ])
    expect(parseXiaomiOcrOutput(text).text).toBe(text);
});

test('leaves formulas and fenced source verbatim', () => {
  const text = '\\[x^2 + y^2\\]\n\n```text\n<fcel>source<nl>\n```';
  expect(parseXiaomiOcrOutput(text).text).toBe(text);
});

test('keeps independent tables and merged origins as structured data', () => {
  const result = parseXiaomiOcrOutput(
    '<fcel>001<lcel><nl><fcel>A<fcel>2.00<nl>\n\nNext\n<fcel>B<nl>',
  );
  expect(result.invalidStructure).toBe(false);
  expect(result.tables).toHaveLength(2);
  expect(result.tables[0]).toEqual({
    rowCount: 2,
    columnCount: 2,
    cells: [
      { text: '001', row: 0, column: 0, rows: 1, columns: 2 },
      { text: 'A', row: 1, column: 0, rows: 1, columns: 1 },
      { text: '2.00', row: 1, column: 1, rows: 1, columns: 1 },
    ],
  });
});

test('reports cut-off table markup without treating fenced examples as parse failures', () => {
  expect(parseXiaomiOcrOutput('<fcel>unfinished').invalidStructure).toBe(true);
  expect(parseXiaomiOcrOutput('```text\n<fcel>example<nl>\n```')).toMatchObject({
    tables: [],
    invalidStructure: false,
  });
});

test('keeps exact field strings and rejects numeric coercion, missing keys and extra fields', () => {
  expect(
    parseXiaomiFields('{"id":"0012","amount":"12.00 USD","date":null}', ['id', 'amount', 'date']),
  ).toEqual({ id: '0012', amount: '12.00 USD', date: null });
  expect(parseXiaomiFields('{"id":""}', ['id'])).toEqual({ id: null });
  for (const raw of ['{"id":12}', '{}', '{"id":"0012","extra":"x"}', '{"id":'])
    expect(parseXiaomiFields(raw, ['id'])).toBeUndefined();
});
