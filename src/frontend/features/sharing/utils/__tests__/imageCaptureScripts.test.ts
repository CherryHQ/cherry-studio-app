import { runInNewContext } from 'node:vm';

import { imageMeasurementScript } from '../imageCaptureScripts';

test.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])(
  'card measurement preserves its source and exposes omission when excerpted=%s, clipped=%s',
  async (isExcerpt, isClipped) => {
    const classes = new Set<string>();
    const card = {
      textContent: 'Retained source, including the final code line.',
      scrollHeight: isClipped ? 2200 : 800,
      clientHeight: isClipped ? 1950 : 800,
      classList: {
        toggle(name: string, enabled: boolean) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
      },
    };
    const notice = { hidden: !isExcerpt };
    const main = {
      scrollWidth: 360,
      querySelector: (selector: string) => (selector === '.share-excerpt' ? notice : card),
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({
        top: 0,
        height: card.clientHeight + (notice.hidden ? 0 : 24) + 104,
      }),
    };
    let receive!: (message: { phase: string; height: number; width: number }) => void;
    const measured = new Promise<{ phase: string; height: number; width: number }>((resolve) => {
      receive = resolve;
    });
    runInNewContext(imageMeasurementScript(1, 'single'), {
      window: { ReactNativeWebView: { postMessage: (data: string) => receive(JSON.parse(data)) } },
      document: {
        querySelector: () => main,
        querySelectorAll: () => [],
        images: [],
        fonts: { ready: Promise.resolve() },
      },
      requestAnimationFrame: (callback: () => void) => callback(),
    });
    expect(await measured).toMatchObject({
      phase: 'measure',
      width: 360,
      height: card.clientHeight + (isExcerpt || isClipped ? 24 : 0) + 104,
    });
    expect(notice.hidden).toBe(!(isExcerpt || isClipped));
    expect(classes.has('is-clipped')).toBe(isClipped);
    expect(card.textContent).toBe('Retained source, including the final code line.');
  },
);
