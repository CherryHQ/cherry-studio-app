import { resolveSidebarColumn } from '../resolveSidebarColumn';

const wide = {
  content: 'sidebar' as const,
  fold: null,
  insetLeft: 0,
  insetRight: 0,
  isPaneInColumn: false,
  isWide: true,
  windowWidth: 951,
};

describe('resolveSidebarColumn', () => {
  test('overlays the content in a compact window', () => {
    expect(resolveSidebarColumn({ ...wide, isWide: false })).toEqual({ kind: 'overlay' });
  });

  test('keeps a 280-point column beside the content in a wide window', () => {
    expect(resolveSidebarColumn(wide)).toEqual({
      content: 'sidebar',
      foldGap: 0,
      kind: 'permanent',
      width: 280,
    });
  });

  test('widens to the file pane width while searching', () => {
    expect(resolveSidebarColumn({ ...wide, content: 'search', insetRight: 72 })).toMatchObject({
      content: 'search',
      width: 378,
    });
  });

  test('adds the leading safe area outside the column content', () => {
    expect(resolveSidebarColumn({ ...wide, insetLeft: 24 })).toMatchObject({ width: 304 });
  });

  test('yields the column to the file pane beside the chat', () => {
    expect(resolveSidebarColumn({ ...wide, isPaneInColumn: true })).toEqual({ kind: 'yielded' });
  });

  test('reaches across an active fold down the window', () => {
    const fold = { height: 669, isActive: true, width: 40, x: 455, y: 0 };
    expect(resolveSidebarColumn({ ...wide, fold })).toEqual({
      content: 'sidebar',
      foldGap: 40,
      kind: 'permanent',
      width: 495,
    });
  });

  test('ignores a flat fold, a fold across the window, and a fold at the window edge', () => {
    const fold = { height: 669, isActive: true, width: 40, x: 455, y: 0 };
    for (const ignored of [
      { ...fold, isActive: false },
      { height: 40, isActive: true, width: 951, x: 0, y: 300 },
      { ...fold, x: 0 },
    ]) {
      expect(resolveSidebarColumn({ ...wide, fold: ignored })).toMatchObject({ width: 280 });
    }
  });
});
