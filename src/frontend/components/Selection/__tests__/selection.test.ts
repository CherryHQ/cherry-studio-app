import { areAllSelected, toggleSelection } from '../selection';

describe('selection', () => {
  test('toggles an id without mutating the current selection', () => {
    const current = new Set(['id-1']);

    const removed = toggleSelection(current, 'id-1');
    const added = toggleSelection(current, 'id-2');

    expect(current).toEqual(new Set(['id-1']));
    expect(removed).toEqual(new Set());
    expect(added).toEqual(new Set(['id-1', 'id-2']));
  });

  test('reports the all-selected state', () => {
    expect(areAllSelected(new Set(['id-1', 'id-2']), ['id-1', 'id-2'])).toBe(true);
    expect(areAllSelected(new Set(['id-1']), ['id-1', 'id-2'])).toBe(false);
    expect(areAllSelected(new Set(), [])).toBe(false);
  });
});
