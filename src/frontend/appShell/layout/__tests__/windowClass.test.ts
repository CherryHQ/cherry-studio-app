import { resolveFilePaneWidth, resolveWindowClass } from '../windowClass';

const noInsets = { insetLeft: 0, insetRight: 0, textScale: 1 };

describe('resolveWindowClass', () => {
  test.each([
    [402, 'compact'],
    [744, 'compact'],
    [800, 'medium'],
    [1079, 'medium'],
    [1080, 'expanded'],
    [1440, 'expanded'],
  ] as const)('places a %ipt window in the %s class', (width, windowClass) => {
    expect(resolveWindowClass({ ...noInsets, width })).toBe(windowClass);
  });

  test('subtracts each side of an asymmetric safe area', () => {
    expect(resolveWindowClass({ ...noInsets, insetRight: 72, width: 1120 })).toBe('medium');
    expect(resolveWindowClass({ ...noInsets, insetLeft: 30, insetRight: 10, width: 1120 })).toBe(
      'expanded',
    );
  });

  test('needs a wider window as text grows, but never narrows the threshold for smaller text', () => {
    expect(resolveWindowClass({ ...noInsets, textScale: 1.25, width: 1210 })).toBe('medium');
    expect(resolveWindowClass({ ...noInsets, textScale: 1.25, width: 834 })).toBe('compact');
    expect(resolveWindowClass({ ...noInsets, textScale: 0.85, width: 1000 })).toBe('medium');
  });
});

describe('resolveFilePaneWidth', () => {
  test.each([
    [800, 360],
    [930, 400],
    [1160, 499],
    [1600, 520],
  ])('gives %ipt of content a %ipt file pane', (contentWidth, paneWidth) => {
    expect(resolveFilePaneWidth(contentWidth)).toBe(paneWidth);
  });
});
