import { resolveSidebarColumn, resolveSidebarToggleAction } from '../resolveSidebarColumn';

const wide = {
  content: 'sidebar' as const,
  fold: null,
  insetLeft: 0,
  insetRight: 0,
  isCollapsed: false,
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

  test('hides a collapsed column until the window narrows or the file pane takes it', () => {
    const collapsed = { ...wide, isCollapsed: true };
    expect(resolveSidebarColumn(collapsed)).toEqual({ kind: 'collapsed' });
    expect(resolveSidebarColumn({ ...collapsed, isWide: false })).toEqual({ kind: 'overlay' });
    expect(resolveSidebarColumn({ ...collapsed, isPaneInColumn: true })).toEqual({
      kind: 'yielded',
    });
  });

  test('keeps a collapsed column on the leading side of a fold that divides the window', () => {
    const fold = { height: 669, width: 40, x: 455, y: 0 };
    expect(resolveSidebarColumn({ ...wide, fold, isCollapsed: true })).toMatchObject({
      kind: 'permanent',
      width: 495,
    });
    expect(resolveSidebarColumn({ ...wide, fold: null, isCollapsed: true })).toEqual({
      kind: 'collapsed',
    });
  });

  test('reaches across a fold down the window', () => {
    const fold = { height: 669, width: 40, x: 455, y: 0 };
    expect(resolveSidebarColumn({ ...wide, fold })).toEqual({
      content: 'sidebar',
      foldGap: 40,
      kind: 'permanent',
      width: 495,
    });
  });

  test('ignores a fold across the window and a fold at the window edge', () => {
    const fold = { height: 669, width: 40, x: 455, y: 0 };
    for (const ignored of [
      { height: 40, width: 951, x: 0, y: 300 },
      { ...fold, x: 0 },
    ]) {
      expect(resolveSidebarColumn({ ...wide, fold: ignored })).toMatchObject({ width: 280 });
    }
  });
});

describe('resolveSidebarToggleAction', () => {
  test('opens an overlay and hides or shows a wide column', () => {
    expect(resolveSidebarToggleAction({ kind: 'overlay' })).toBe('open');
    expect(resolveSidebarToggleAction(resolveSidebarColumn(wide))).toBe('hide');
    expect(resolveSidebarToggleAction({ kind: 'collapsed' })).toBe('show');
  });

  test('offers no button while the file pane or a fold holds the column', () => {
    const fold = { height: 669, width: 40, x: 455, y: 0 };
    expect(resolveSidebarToggleAction({ kind: 'yielded' })).toBeUndefined();
    expect(resolveSidebarToggleAction(resolveSidebarColumn({ ...wide, fold }))).toBeUndefined();
  });
});
