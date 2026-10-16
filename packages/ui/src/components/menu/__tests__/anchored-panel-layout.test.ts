import { getAnchoredPanelLayout } from '../anchored-panel-layout';

const viewport = {
  height: 800,
  insets: { bottom: 24, left: 0, right: 0, top: 40 },
  panelHeight: 200,
  preferredMaxHeight: 400,
  preferredWidth: 320,
  width: 390,
};

describe('anchored panel placement', () => {
  it('opens below a trigger with room and keeps the panel inside the horizontal safe area', () => {
    const layout = getAnchoredPanelLayout({
      ...viewport,
      anchor: { height: 44, pageX: 300, pageY: 100, width: 60 },
    });

    expect(layout.opensAbove).toBe(false);
    expect(layout.top).toBe(152);
    expect(layout.left).toBeGreaterThanOrEqual(16);
    expect(layout.left + layout.width).toBeLessThanOrEqual(374);
  });

  it('opens above a trigger near the bottom instead of placing text offscreen', () => {
    const layout = getAnchoredPanelLayout({
      ...viewport,
      anchor: { height: 44, pageX: 20, pageY: 650, width: 112 },
    });

    expect(layout.opensAbove).toBe(true);
    expect(layout.top + layout.visibleHeight).toBe(642);
  });

  it('bounds long content and wide panels in a small landscape viewport', () => {
    const layout = getAnchoredPanelLayout({
      ...viewport,
      anchor: { height: 44, pageX: 240, pageY: 120, width: 112 },
      height: 220,
      insets: { bottom: 20, left: 30, right: 30, top: 20 },
      panelHeight: 2000,
      width: 300,
    });

    expect(layout.width).toBe(208);
    expect(layout.visibleHeight).toBe(148);
    expect(layout.top).toBe(36);
    expect(layout.left).toBe(46);
    expect(layout.top + layout.visibleHeight).toBeLessThanOrEqual(184);
  });
});
