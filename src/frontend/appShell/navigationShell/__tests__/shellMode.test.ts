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

  test('selects wide-rail on tablets without trailing vertical system inset', () => {
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
  });

  test('selects vertical-rail when OS bar occupies trailing edge', () => {
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
});
