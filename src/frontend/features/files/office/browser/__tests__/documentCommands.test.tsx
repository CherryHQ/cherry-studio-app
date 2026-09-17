/** @jest-environment jsdom */
import { act, render } from '@testing-library/react';

import { DocxDocument } from '../DocxDocument';
import type { OfficeRendererProps } from '../OfficeDocumentContent';
import { PptxDocument } from '../PptxDocument';

const mockScroll = jest.fn();
const mockGoToSlide = jest.fn().mockResolvedValue(undefined);
jest.mock('docx-preview', () => ({
  renderAsync: async (_bytes: unknown, target: HTMLElement) => {
    target.innerHTML =
      '<section class="docx-preview"></section><section class="docx-preview"></section>';
    target.querySelectorAll<HTMLElement>('section').forEach((page) => {
      page.scrollIntoView = mockScroll;
    });
  },
}));
jest.mock('../officeZipPreflight', () => ({ assertZipLimits: () => {} }));
jest.mock('@aiden0z/pptx-renderer', () => ({
  RECOMMENDED_ZIP_LIMITS: {},
  parseZipLazyMedia: async () => ({}),
  buildPresentation: () => ({ slides: [], layouts: new Map(), masters: new Map() }),
  PptxViewer: class {
    slideCount = 2;
    currentSlideIndex = 0;
    zoomPercent = 100;
    load() {}
    destroy() {}
    async renderList() {}
    async setZoom() {}
    goToSlide(...args: unknown[]) {
      return mockGoToSlide(...args);
    }
  },
}));

const originalResize = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
const originalIntersection = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver');
beforeEach(() => {
  jest.clearAllMocks();
  const Observer = class {
    observe() {}
    disconnect() {}
  };
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: Observer });
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: Observer,
  });
});
afterEach(() => {
  for (const [key, original] of [
    ['ResizeObserver', originalResize],
    ['IntersectionObserver', originalIntersection],
  ] as const) {
    if (original) Object.defineProperty(globalThis, key, original);
    else Reflect.deleteProperty(globalThis, key);
  }
});

it.each(['docx', 'pptx'] as const)(
  'executes each %s command once despite native prop echoes and restores reading focus',
  async (type) => {
    const Document = type === 'docx' ? DocxDocument : PptxDocument;
    const action = type === 'docx' ? mockScroll : mockGoToSlide;
    const props: OfficeRendererProps = {
      bytes: new Uint8Array([1]),
      fileName: `report.${type}`,
      colors: {
        paper: '#fff',
        ink: '#000',
        background: '#fff',
        foreground: '#000',
        border: '#ddd',
      },
      labels: { chart: 'Chart', unsupportedChart: 'Unsupported', imageUnavailable: 'Unavailable' },
      command: null,
      spreadsheetView: { zoom: 100, sheet: 0 },
      onStatus: jest.fn(),
      onSelection: jest.fn(),
    };
    const view = render(<Document {...props} />);
    await act(async () => {
      await Promise.resolve();
    });
    const command = { id: 1, name: 'page' as const, value: 2 };
    await act(async () => {
      view.rerender(<Document {...props} command={command} />);
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(view.getByRole('region', { name: `report.${type}` }));
    await act(async () => {
      view.rerender(<Document {...props} command={{ ...command }} />);
    });
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => {
      view.rerender(<Document {...props} command={{ ...command, id: 2 }} />);
    });
    expect(action).toHaveBeenCalledTimes(2);
    view.unmount();
  },
);
