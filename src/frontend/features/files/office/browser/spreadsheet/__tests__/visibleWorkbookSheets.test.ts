import { visibleWorkbookSheets } from '../visibleWorkbookSheets';
import { createMockWorkbookModel } from './_mockWorkbookModel';

it('keeps visible sheets in source order and falls back to the first all-hidden sheet', () => {
  const sheets = createMockWorkbookModel().sheets;
  expect(visibleWorkbookSheets(sheets)).toEqual(sheets.filter((sheet) => !sheet.hidden));
  const hidden = sheets.map((sheet) => ({ ...sheet, hidden: true }));
  expect(visibleWorkbookSheets(hidden)).toEqual(hidden.slice(0, 1));
  expect(visibleWorkbookSheets([])).toEqual([]);
});
