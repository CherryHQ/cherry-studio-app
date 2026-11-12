import { createRef, useImperativeHandle, type Ref } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { useHtmlCapture } from '@/frontend/components/HtmlCapture';

import { useDocumentExportHtmlCapture } from '../useDocumentExportHtmlCapture';

const mockCaptureHtml = jest.fn();
const mockImageRelease = jest.fn();
jest.mock('@/frontend/components/HtmlCapture', () => ({
  useHtmlCapture: () => ({ capture: mockCaptureHtml, surface: null }),
}));
jest.mock('../../utils/stitchCapturedPngPages', () => ({
  stitchCapturedPngPages: async (capture: (onPage: () => Promise<void>) => Promise<void>) => {
    await capture(async () => {});
    return { uri: 'file:///stitched.png', width: 1080, height: 7200, release: mockImageRelease };
  },
}));

type Capture = ReturnType<typeof useDocumentExportHtmlCapture>;
type HtmlInput = Parameters<ReturnType<typeof useHtmlCapture>['capture']>[0];
function Probe({ ref }: { ref: Ref<Capture> }) {
  const capture = useDocumentExportHtmlCapture();
  useImperativeHandle(ref, () => capture, [capture]);
  return null;
}
const layout = (width: number, height: number) =>
  ({
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  }) as LayoutChangeEvent;
const input = () => ({
  html: '<main>Content</main>',
  width: 360,
  layout: 'single' as const,
  signal: new AbortController().signal,
  onPage: jest.fn(async () => {}),
});
const ref = createRef<Capture>();
let renderer: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockCaptureHtml.mockReset();
  act(() => {
    renderer = create(<Probe ref={ref} />);
  });
});
afterEach(() => {
  act(() => renderer.unmount());
});

test('waits for layout and captures every tile inside the available native viewport', async () => {
  const request = input();
  mockCaptureHtml.mockImplementation(async ({ source, onPage, signal }: HtmlInput) => {
    const frames = source({ id: 1, density: 2 }).readFrames({
      phase: 'measure',
      width: 360,
      height: 2400,
      ink: [],
    })!;
    expect(frames.length).toBeGreaterThan(2);
    for (const [index, frame] of frames.entries()) {
      expect(frame.width / 2).toBeLessThan(320);
      expect(frame.height / 2).toBeLessThan(480);
      await onPage(
        {
          uri: `file:///tile-${index}.png`,
          width: frame.width,
          height: frame.height,
          release() {},
        },
        index,
        frames.length,
        signal,
      );
    }
  });
  let result!: Promise<void>;
  act(() => {
    result = ref.current!.capture(request);
  });
  expect(mockCaptureHtml).not.toHaveBeenCalled();
  await act(async () => {
    ref.current!.onCaptureLayout(layout(320, 480));
    await result;
  });
  expect(request.onPage).toHaveBeenCalledWith({
    uri: 'file:///stitched.png',
    width: 1080,
    height: 7200,
    index: 0,
    total: 1,
  });
  expect(mockImageRelease).toHaveBeenCalledTimes(1);
});

test('a resize cancels the planned capture and releases a late stitched result without publishing it', async () => {
  const request = input();
  let finishCapture!: () => void;
  mockCaptureHtml.mockImplementation(({ source }: HtmlInput) => {
    source({ id: 1, density: 3 }).readFrames({
      phase: 'measure',
      width: 360,
      height: 2400,
      ink: [],
    });
    return new Promise<void>((resolve) => {
      finishCapture = resolve;
    });
  });
  act(() => ref.current!.onCaptureLayout(layout(390, 600)));
  const result = ref.current!.capture(request).catch((error: unknown) => error);
  act(() => ref.current!.onCaptureLayout(layout(390, 300)));
  expect((mockCaptureHtml.mock.calls[0][0] as HtmlInput).signal.aborted).toBe(true);
  finishCapture();
  expect(await result).toMatchObject({ name: 'AbortError' });
  expect(request.onPage).not.toHaveBeenCalled();
  expect(mockImageRelease).toHaveBeenCalledTimes(1);
});

test('closing before the first layout settles the pending capture', async () => {
  const request = input();
  const result = ref.current!.capture(request).catch((error: unknown) => error);
  act(() => renderer.unmount());
  expect(await result).toMatchObject({ name: 'AbortError' });
  expect(mockCaptureHtml).not.toHaveBeenCalled();
  expect(request.onPage).not.toHaveBeenCalled();
});
