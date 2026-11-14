import { getSidebarBranchLayout, getSidebarBranchOffset } from '../sidebarBranchLayout';

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

test.each([5, 20, 1000])('preserves every level and parent coordinate at depth %i', (depth) => {
  const ancestors = Array.from({ length: depth - 1 }, () => ({ continues: true }));
  const layout = getSidebarBranchLayout(depth, ancestors);

  expect(layout.indentation).toBe(depth * 12);
  expect(layout.parentIndentation).toBe(getSidebarBranchLayout(depth - 1).indentation);
  expect(layout.ancestorIndentations).toHaveLength(depth - 1);
  expect(layout.ancestorIndentations.at(-1)).toBe((depth - 2) * 12);
  expect(ancestors).toHaveLength(depth - 1);
});

test('keeps a deep ancestor continuation even when its neighboring ancestors end', () => {
  const ancestors = Array.from({ length: 99 }, () => ({ continues: false }));
  ancestors[90] = { continues: true };
  expect(getSidebarBranchLayout(100, ancestors).ancestorIndentations).toEqual([1080]);
});

test('follows the top row continuously into a child and back to a shallow sibling', () => {
  const rows = [
    { top: 100, height: 44, depth: 12 },
    { top: 144, height: 44, depth: 13 },
    { top: 188, height: 60, depth: 1 },
    { top: 248, height: 44, depth: 0 },
  ];
  expect(getSidebarBranchOffset(rows, 100)).toBe(144);
  expect(getSidebarBranchOffset(rows, 122)).toBe(150);
  expect(getSidebarBranchOffset(rows, 144)).toBe(156);
  expect(getSidebarBranchOffset(rows, 166)).toBe(84);
  expect(getSidebarBranchOffset(rows, 188)).toBe(12);
  expect(getSidebarBranchOffset(rows, 218)).toBe(6);
  expect(getSidebarBranchOffset(rows, 248)).toBe(0);
});

test('resets outside registered rows and across an Agent header gap', () => {
  const rows = [
    { top: 40, height: 44, depth: 4 },
    { top: 120, height: 44, depth: 1 },
  ];
  expect(getSidebarBranchOffset([], 100)).toBe(0);
  expect(getSidebarBranchOffset(rows, 0)).toBe(0);
  expect(getSidebarBranchOffset(rows, 40)).toBe(48);
  expect(getSidebarBranchOffset(rows, 62)).toBe(24);
  expect(getSidebarBranchOffset(rows, 100)).toBe(0);
  expect(getSidebarBranchOffset(rows, 164)).toBe(0);
});
