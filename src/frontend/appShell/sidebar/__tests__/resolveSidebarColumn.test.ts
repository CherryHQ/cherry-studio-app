import {
  resolveSidebarColumn,
  resolveSidebarDrawer,
  resolveSidebarOverlayWidth,
  resolveSidebarToggleAction,
} from '../resolveSidebarColumn';

const wide = {
  content: 'sidebar' as const,
  fold: null,
  insetLeft: 0,
  insetRight: 0,
  isChatFocused: true,
  isCollapsed: false,
  isPaneInColumn: false,
  isWide: true,
  windowWidth: 951,
};

describe('resolveSidebarColumn', () => {
  test('overlays the content in a compact window', () => {
    expect(resolveSidebarColumn({ ...wide, isWide: false })).toEqual({ kind: 'overlay' });
  });

  test('keeps compact inactive drawers in front mode without flipping to permanent', () => {
    const input = { ...wide, isWide: false };
    const inactive = resolveSidebarColumn({ ...input, isChatFocused: false });
    expect(inactive).toEqual({ kind: 'inactive' });
    expect(resolveSidebarToggleAction(inactive)).toBeUndefined();
    expect(resolveSidebarDrawer(inactive, 320, false)).toEqual({
      drawerType: 'front',
      drawerStyle: { pointerEvents: 'none', width: 320 },
    });
    expect(resolveSidebarDrawer(inactive, 320)).toMatchObject({
      drawerType: 'permanent',
      drawerStyle: { position: 'absolute', opacity: 0, pointerEvents: 'none' },
    });
    expect(resolveSidebarColumn(input)).toEqual({ kind: 'overlay' });
  });

  test('returns inactive in a wide window when chat is not focused and preserves compact drawer roots', () => {
    expect(resolveSidebarColumn({ ...wide, isChatFocused: false })).toEqual({ kind: 'inactive' });
    expect(
      resolveSidebarColumn({
        ...wide,
        canOpenCompactDrawer: true,
        isChatFocused: false,
        isWide: false,
      }),
    ).toEqual({ kind: 'overlay' });
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

  test('hides a collapsed column until the window narrows', () => {
    const collapsed = { ...wide, isCollapsed: true };
    expect(resolveSidebarColumn(collapsed)).toEqual({ kind: 'collapsed' });
    expect(resolveSidebarColumn({ ...collapsed, isWide: false })).toEqual({ kind: 'overlay' });
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

describe('resolveSidebarDrawer', () => {
  test('switches cleanly between permanent chat sidebar and inactive non-chat pages', () => {
    const drawer = (isChatFocused: boolean) =>
      resolveSidebarDrawer(resolveSidebarColumn({ ...wide, isChatFocused }), 400);
    expect(drawer(true)).toMatchObject({ drawerType: 'permanent', drawerStyle: { width: 280 } });
    expect(drawer(false)).toMatchObject({
      drawerType: 'permanent',
      drawerStyle: { position: 'absolute', opacity: 0, pointerEvents: 'none' },
    });
    expect(drawer(true).drawerStyle).toEqual({ width: 280 });
  });

  test('a compact window overlays the stationary chat', () => {
    expect(resolveSidebarDrawer({ kind: 'overlay' }, 320, false)).toEqual({
      drawerType: 'front',
      drawerStyle: { pointerEvents: 'auto', width: 320 },
    });
  });
});

describe('resolveSidebarOverlayWidth', () => {
  test('spans the full window width on portrait phones without leaving a reveal strip', () => {
    expect(resolveSidebarOverlayWidth(393, 0)).toBe(393);
  });

  test('does not cap wider compact windows at 400 points', () => {
    expect(resolveSidebarOverlayWidth(440, 0)).toBe(440);
    expect(resolveSidebarOverlayWidth(744, 0)).toBe(744);
  });

  test('subtracts the trailing safe area inset', () => {
    expect(resolveSidebarOverlayWidth(430, 64)).toBe(366);
  });

  test('enforces the 280-point minimum floor', () => {
    expect(resolveSidebarOverlayWidth(0, 0)).toBe(280);
    expect(resolveSidebarOverlayWidth(300, 64)).toBe(280);
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
