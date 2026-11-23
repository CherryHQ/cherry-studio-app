import { resolveNavigationShellMode } from '../shellMode';

describe('resolveNavigationShellMode', () => {
  test('selects compact-dock on standard phones and narrow windows', () => {
    expect(
      resolveNavigationShellMode({
        fold: null,
        height: 874,
        insetLeft: 0,
        insetRight: 0,
        insetTop: 59,
        width: 402,
        windowClass: 'compact',
      }),
    ).toBe('compact-dock');
  });

  test('keeps symmetric landscape notched phones on compact-dock instead of vertical-rail', () => {
    expect(
      resolveNavigationShellMode({
        fold: null,
        height: 393,
        insetLeft: 59,
        insetRight: 59,
        insetTop: 0,
        width: 852,
        windowClass: 'compact',
      }),
    ).toBe('compact-dock');
  });

  test('selects wide-rail on tablets and compact-dock on narrow iPad Split View', () => {
    expect(
      resolveNavigationShellMode({
        fold: null,
        height: 834,
        insetLeft: 0,
        insetRight: 0,
        insetTop: 24,
        width: 1210,
        windowClass: 'wide',
      }),
    ).toBe('wide-rail');

    expect(
      resolveNavigationShellMode({
        fold: null,
        height: 1024,
        insetLeft: 0,
        insetRight: 0,
        insetTop: 24,
        width: 375,
        windowClass: 'compact',
      }),
    ).toBe('compact-dock');
  });

  test('selects vertical-rail when OS bar occupies only the trailing edge on Duo', () => {
    expect(
      resolveNavigationShellMode({
        fold: null,
        height: 626,
        insetLeft: 0,
        insetRight: 58,
        insetTop: 0,
        width: 890,
        windowClass: 'wide',
      }),
    ).toBe('vertical-rail');

    expect(
      resolveNavigationShellMode({
        fold: null,
        height: 678,
        insetLeft: 0,
        insetRight: 54,
        insetTop: 0,
        width: 466,
        windowClass: 'compact',
      }),
    ).toBe('vertical-rail');
  });

  test('handles foldable hinge postures for side-by-side compact vs horizontal across', () => {
    // Vertical hinge with side-by-side layout on a compact window uses vertical rail
    expect(
      resolveNavigationShellMode({
        fold: { height: 678, width: 20, x: 420, y: 0 },
        height: 678,
        insetLeft: 0,
        insetRight: 0,
        insetTop: 0,
        width: 860,
        windowClass: 'compact',
      }),
    ).toBe('vertical-rail');

    // Horizontal fold spanning width across a compact window stays compact-dock
    expect(
      resolveNavigationShellMode({
        fold: { height: 20, width: 466, x: 0, y: 320 },
        height: 678,
        insetLeft: 0,
        insetRight: 0,
        insetTop: 0,
        width: 466,
        windowClass: 'compact',
      }),
    ).toBe('compact-dock');

    // Wide unfolded foldable without trailing system inset promotes to wide-rail
    expect(
      resolveNavigationShellMode({
        fold: { height: 20, width: 890, x: 0, y: 400 },
        height: 820,
        insetLeft: 0,
        insetRight: 0,
        insetTop: 20,
        width: 890,
        windowClass: 'wide',
      }),
    ).toBe('wide-rail');
  });
});
