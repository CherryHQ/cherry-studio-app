import { OFFICE_CELL_TEXT_LIMIT } from '../../../officePreview';
import { toOfficeCellSelection } from '../cellSelection';

it('keeps the original formula, displayed result and calculation source separate', () => {
  expect(
    toOfficeCellSelection({
      address: 'B4',
      cell: { formula: 'SUM(A1:A3)', formulaState: 'cached', text: '6', raw: 6 },
    }),
  ).toEqual({
    address: 'B4',
    formula: 'SUM(A1:A3)',
    formulaState: 'cached',
    text: '6',
    truncated: false,
  });
});

it('distinguishes an empty selected cell from cleared selection', () => {
  expect(toOfficeCellSelection(null)).toBeNull();
  expect(toOfficeCellSelection({ address: 'A1', cell: null })).toMatchObject({
    address: 'A1',
    text: '',
    formula: null,
  });
});

it('bounds oversized bridge content and declares the partial detail', () => {
  const value = 'x'.repeat(OFFICE_CELL_TEXT_LIMIT + 1);
  const selection = toOfficeCellSelection({ address: 'A1', cell: { text: value, formula: value } });
  expect(selection?.text).toHaveLength(OFFICE_CELL_TEXT_LIMIT);
  expect(selection?.formula).toHaveLength(OFFICE_CELL_TEXT_LIMIT);
  expect(selection?.truncated).toBe(true);
});
