import { runInNewContext } from 'node:vm';

import type { HtmlCapturePage } from '../htmlCapturePlan';
import { htmlCaptureSetupScript } from '../htmlCaptureScript';

test.each([false, true])(
  'preserves all slide dimensions from the original grid, including hidden slides: %s',
  async (hidden) => {
    const root = new FixtureElement();
    const body = new FixtureElement(root);
    const deck = new FixtureElement(body);
    deck.style.setProperty('display', 'grid');
    deck.style.setProperty('height', '720px');
    const slides = [new FixtureElement(deck), new FixtureElement(deck)];
    if (hidden) slides[0].style.setProperty('display', 'none', 'important');

    // Model the fixture's percentage sizing: two grid columns in a 960 × 720 deck.
    // Turning that deck into an auto-height block changes unpinned slides to 960 × 180.
    // This protects measurement ordering; native browser fidelity still needs acceptance.
    const computedStyle = (slide: (typeof slides)[number]) => {
      const display = slide.style.getPropertyValue('display') || 'block';
      return {
        display,
        width:
          slide.style.getPropertyValue('width') ||
          (display === 'none'
            ? '100%'
            : deck.style.getPropertyValue('display') === 'grid'
              ? '480px'
              : '960px'),
        height:
          slide.style.getPropertyValue('height') ||
          (display === 'none'
            ? '100%'
            : deck.style.getPropertyValue('height') === '720px'
              ? '720px'
              : '180px'),
      };
    };
    slides.forEach((slide, index) => {
      slide.getBoundingClientRect = () => ({
        left: 0,
        top: index * 720,
        bottom: (index + 1) * 720,
        width: parseFloat(computedStyle(slide).width),
        height: parseFloat(computedStyle(slide).height),
      });
    });
    let receive!: (message: { phase: string; pages: HtmlCapturePage[] }) => void;
    const measured = new Promise<{ phase: string; pages: HtmlCapturePage[] }>((resolve) => {
      receive = resolve;
    });
    runInNewContext(htmlCaptureSetupScript('capture', 'pptx', 2), {
      window: { ReactNativeWebView: { postMessage: (data: string) => receive(JSON.parse(data)) } },
      document: {
        documentElement: root,
        body,
        head: { appendChild() {} },
        createElement: () => ({}),
        querySelector: () => ({}),
        querySelectorAll: (selector: string) => (selector === '[data-slide],.slide' ? slides : []),
        images: [],
        fonts: { ready: Promise.resolve() },
        getAnimations: () => [],
      },
      getComputedStyle: computedStyle,
      requestAnimationFrame: (callback: () => void) => callback(),
    });
    expect(await measured).toMatchObject({
      phase: 'measured',
      pages: [
        { x: 0, y: 0, width: 480, height: 720 },
        { x: 0, y: 720, width: 480, height: 720 },
      ],
    });
  },
);

class FixtureElement {
  private properties = new Map<string, { value: string; priority: string }>();
  constructor(readonly parentElement?: FixtureElement) {}
  closest = () => null;
  scrollWidth = 1280;
  scrollHeight = 1440;
  getBoundingClientRect = () => ({ left: 0, top: 0, bottom: 1440, width: 1280, height: 1440 });
  style = {
    setProperty: (key: string, value: string, priority = '') => {
      this.properties.set(key, { value, priority });
    },
    getPropertyValue: (key: string) => this.properties.get(key)?.value ?? '',
    getPropertyPriority: (key: string) => this.properties.get(key)?.priority ?? '',
    removeProperty: (key: string) => this.properties.delete(key),
  };
}
