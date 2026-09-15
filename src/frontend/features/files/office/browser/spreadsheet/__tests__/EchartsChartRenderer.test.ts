/** @jest-environment jsdom */

import { echartsChartRenderer } from '../charts/EchartsChartRenderer';
import type { ChartModel } from '../renderModel';

/**
 * EchartsChartRenderer lifecycle tests.
 *
 * When jsdom does not have the `canvas` npm package, echarts CanvasRenderer cannot create a real 2D context.
 * HTMLCanvasElement.getContext('2d') throws "Not implemented" in jsdom. That is an environment limit, not a bug here.
 * This uses Jest replacements to verify initial sizing, resize transitions and cleanup,
 * ResizeObserver handling when the first non-zero size appears, and dispose cleanup.
 * The actual ChartModel -> option mapping is covered by buildChartOption.test.ts.
 */

const mockSetOption = jest.fn();
const mockResize = jest.fn();
const mockDispose = jest.fn();
const mockInit = jest.fn((dom: HTMLElement, theme?: unknown, opts?: unknown) => {
  void dom;
  void theme;
  void opts;
  return { setOption: mockSetOption, resize: mockResize, dispose: mockDispose };
});

jest.mock('echarts/core', () => ({
  init: (...args: Parameters<typeof mockInit>) => mockInit(...args),
  use: jest.fn(),
}));
jest.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {}, PieChart: {} }));
jest.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  TitleComponent: {},
}));
jest.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

let resizeObserverInstances: {
  callback: ResizeObserverCallback;
  observe: ReturnType<typeof jest.fn>;
  disconnect: ReturnType<typeof jest.fn>;
}[] = [];

class FakeResizeObserver {
  callback: ResizeObserverCallback;
  observe = jest.fn();
  disconnect = jest.fn();
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObserverInstances.push(this as any);
  }
  unobserve = jest.fn();
}

const originalResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
const chart: ChartModel = {
  rect: { x: 0, y: 0, width: 100, height: 100 },
  type: 'bar',
  barDirection: 'col',
  series: [{ categories: ['a'], values: [1] }],
};

describe('echartsChartRenderer.render', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: FakeResizeObserver,
    });
    resizeObserverInstances = [];
    mockSetOption.mockClear();
    mockResize.mockClear();
    mockDispose.mockClear();
    mockInit.mockClear();
  });

  afterEach(() => {
    if (originalResizeObserver)
      Object.defineProperty(globalThis, 'ResizeObserver', originalResizeObserver);
    else Reflect.deleteProperty(globalThis, 'ResizeObserver');
  });

  it('initializes an echarts instance on the container and sets the mapped option', async () => {
    const container = document.createElement('div');

    const dispose1 = echartsChartRenderer.render(chart, container);

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit.mock.calls[0][0]).toBe(container);
    expect(mockSetOption).toHaveBeenCalledTimes(1);
    expect(mockSetOption.mock.calls[0][0]).toMatchObject({
      series: [expect.objectContaining({ type: 'bar' })],
    });

    dispose1();
  });

  it('observes the container for resize and re-applies the option + resizes once it first gets a nonzero size', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 0, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 0, configurable: true });

    const disposeFn = echartsChartRenderer.render(chart, container);
    expect(resizeObserverInstances).toHaveLength(1);
    const observer = resizeObserverInstances[0];
    expect(observer.observe).toHaveBeenCalledWith(container);

    mockSetOption.mockClear();

    // Still zero-size: resize callback should be a no-op.
    observer.callback([] as any, observer as any);
    expect(mockSetOption).not.toHaveBeenCalled();
    expect(mockResize).not.toHaveBeenCalled();

    // Container gains a real size: should re-apply option once and call resize.
    Object.defineProperty(container, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 300, configurable: true });
    observer.callback([] as any, observer as any);
    expect(mockSetOption).toHaveBeenCalledTimes(1);
    expect(mockResize).toHaveBeenCalledTimes(1);

    // Subsequent resize events should just resize, not re-apply the option again.
    mockSetOption.mockClear();
    observer.callback([] as any, observer as any);
    expect(mockSetOption).not.toHaveBeenCalled();
    expect(mockResize).toHaveBeenCalledTimes(2);

    disposeFn();
  });

  it('dispose() disconnects the resize observer and disposes the echarts instance', async () => {
    const container = document.createElement('div');

    const disposeFn = echartsChartRenderer.render(chart, container);
    const observer = resizeObserverInstances[0];

    disposeFn();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });
  it('disposes the instance if option setup fails', async () => {
    mockSetOption.mockImplementationOnce(() => {
      throw new Error('Invalid chart');
    });
    expect(() => echartsChartRenderer.render(chart, document.createElement('div'))).toThrow(
      'Invalid chart',
    );
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it('cleans up once on resize failure and ignores a queued resize after disposal', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 400 });
    Object.defineProperty(container, 'clientHeight', { value: 300 });
    const dispose = echartsChartRenderer.render(chart, container);
    const observer = resizeObserverInstances[0];
    mockResize.mockImplementationOnce(() => {
      throw new Error('Canvas lost');
    });
    expect(() => observer.callback([], observer as unknown as ResizeObserver)).toThrow(
      'Canvas lost',
    );
    dispose();
    observer.callback([], observer as unknown as ResizeObserver);
    expect(mockResize).toHaveBeenCalledTimes(1);
    expect(mockDispose).toHaveBeenCalledTimes(1);
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});
