import { getSidebarBranchLayout } from '../sidebarBranchLayout';

test('keeps shallow conversation nodes aligned with their parents and ancestor rails', () => {
  expect(getSidebarBranchLayout(0)).toEqual({
    indentation: 0,
    parentIndentation: 0,
    ancestorIndentations: [],
  });
  expect(
    getSidebarBranchLayout(4, [{ continues: true }, { continues: false }, { continues: true }]),
  ).toEqual({
    indentation: 48,
    parentIndentation: 36,
    ancestorIndentations: [0, 24],
  });
});

test.each([5, 20, 1000])(
  'bounds deep gutters and keeps a compressed child connected to its displayed parent at depth %i',
  (depth) => {
    const ancestors = Array.from({ length: depth - 1 }, () => ({ continues: true }));
    const layout = getSidebarBranchLayout(depth, ancestors);

    expect(layout.indentation).toBe(48);
    expect(layout.parentIndentation).toBe(getSidebarBranchLayout(depth - 1).indentation);
    expect(layout.ancestorIndentations).toHaveLength(Math.min(depth - 1, 5));
    expect(layout.ancestorIndentations.every((indentation) => indentation <= 48)).toBe(true);
    expect(ancestors).toHaveLength(depth - 1);
  },
);

test('keeps a deep ancestor continuation even when its neighboring ancestors end', () => {
  const ancestors = Array.from({ length: 99 }, () => ({ continues: false }));
  ancestors[90] = { continues: true };
  expect(getSidebarBranchLayout(100, ancestors).ancestorIndentations).toEqual([48]);
});
