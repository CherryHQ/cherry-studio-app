import { getComposerPopoverLayout } from '../composer-popover-layout';

const viewport = {
  anchor: { left: 16, top: 690, width: 358, height: 104 },
  fontScale: 1,
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
  keyboardHeight: 0,
  windowHeight: 844,
  windowWidth: 390,
};

function contains(
  rect: { left: number; top: number; width: number; height: number },
  x: number,
  y: number,
) {
  return (
    x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height
  );
}

describe('composer popover placement', () => {
  test('every outside point dismisses, including side gutters and the bottom safe area', () => {
    const { outside } = getComposerPopoverLayout(viewport);
    for (let y = 1; y < viewport.windowHeight; y += 7) {
      for (let x = 1; x < viewport.windowWidth; x += 7) {
        const coverage = outside.filter((rect) => contains(rect, x, y)).length;
        expect(coverage).toBe(contains(viewport.anchor, x, y) ? 0 : 1);
      }
    }
  });

  test('keeps a normal presentation above its composer', () => {
    const { panel } = getComposerPopoverLayout(viewport);
    expect(panel.top + panel.height).toBe(viewport.anchor.top - 8);
    expect(panel.left).toBe(viewport.anchor.left);
    expect(panel.width).toBe(viewport.anchor.width);
  });

  test.each([1, 2])(
    'a short window with a keyboard and font scale %s retains usable scrolling space',
    (fontScale) => {
      const { panel } = getComposerPopoverLayout({
        ...viewport,
        anchor: { left: 16, top: 120, width: 288, height: 104 },
        fontScale,
        insets: { top: 20, right: 0, bottom: 0, left: 0 },
        keyboardHeight: 300,
        windowHeight: 568,
        windowWidth: 320,
      });
      expect(panel.height).toBeGreaterThanOrEqual(160);
      expect(panel.top).toBe(28);
      expect(panel.top + panel.height).toBe(568 - 300 - 8);
    },
  );

  test('constrains both horizontal edges to current safe areas', () => {
    const { panel } = getComposerPopoverLayout({
      ...viewport,
      windowWidth: 300,
      insets: { top: 20, right: 44, bottom: 0, left: 44 },
    });
    expect(panel.left).toBeGreaterThanOrEqual(52);
    expect(panel.left + panel.width).toBeLessThanOrEqual(248);
  });
});
