import { StrictMode, type Ref } from 'react';
import { View } from 'react-native';
import type { WebViewMessageEvent, WebViewProps } from 'react-native-webview';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createHtmlCaptureSession } from '../createHtmlCaptureSession';
import { HtmlCaptureSurface, type HtmlCaptureRequest } from '../HtmlCaptureSurface';

const mockInject = jest.fn();
const mockCapture = jest.fn();
let mockWebViewProps: WebViewProps;
jest.mock('uniwind', () => ({ withUniwind: (component: unknown) => component }));
jest.mock('@/frontend/utils/capturePng', () => ({
  capturePng: (...args: unknown[]) => mockCapture(...args),
}));
jest.mock('react-native-webview', () => ({
  WebView: function MockWebView(props: WebViewProps & { ref: Ref<unknown> }) {
    const { useImperativeHandle } = jest.requireActual<typeof import('react')>('react');
    useImperativeHandle(props.ref, () => ({ injectJavaScript: mockInject }), []);
    mockWebViewProps = props;
    return null;
  },
}));

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  mockCapture.mockImplementation(async () => ({
    uri: 'file:///capture.png',
    width: 1080,
    height: 2100,
    release: jest.fn(),
  }));
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

async function mount(strict = false) {
  const onPage = jest.fn(async () => {});
  const session = await createHtmlCaptureSession({
    signal: new AbortController().signal,
    timeout: {},
    onPage,
  });
  const outcome = session.finished.catch((error: unknown) => error);
  const request: HtmlCaptureRequest = {
    id: 7,
    density: 3,
    session,
    source: {
      html: '<main>Content</main>',
      contentMode: 'mobile',
      viewport: { width: 360, height: 1 },
      setupScript: 'measure',
      maxMessageLength: 1024,
      timeout: {},
      readFrames: (message) =>
        message.phase === 'measure'
          ? [
              { width: 1080, height: 2100, script: 'page-0' },
              { width: 1080, height: 2100, script: 'page-1' },
            ]
          : undefined,
    },
  };
  act(() => {
    const surface = <HtmlCaptureSurface request={request} />;
    renderer = create(strict ? <StrictMode>{surface}</StrictMode> : surface);
  });
  return { session, outcome, onPage };
}

async function message(value: Record<string, unknown>) {
  await act(async () => {
    mockWebViewProps.onMessage!({
      nativeEvent: { data: JSON.stringify({ id: 7, ...value }) },
    } as WebViewMessageEvent);
  });
}

test('captures only after native layout and matching readiness, including equal-sized pages', async () => {
  const { outcome, onPage } = await mount();
  await message({ phase: 'measure' });
  await message({ phase: 'ready', index: 0 });
  expect(mockCapture).not.toHaveBeenCalled();
  expect(mockInject).not.toHaveBeenCalled();
  act(() => {
    renderer!.root
      .findByType(View)
      .props.onLayout({ nativeEvent: { layout: { width: 360, height: 700 } } });
  });
  expect(mockInject.mock.calls).toEqual([['page-0']]);
  await message({ id: 6, phase: 'ready', index: 0 });
  expect(mockCapture).not.toHaveBeenCalled();
  await message({ phase: 'ready', index: 0 });
  expect(onPage).toHaveBeenCalledTimes(1);
  expect(mockInject.mock.calls).toEqual([['page-0'], ['page-1']]);
  await message({ phase: 'ready', index: 0 });
  expect(mockCapture).toHaveBeenCalledTimes(1);
  await message({ phase: 'ready', index: 1 });
  await expect(outcome).resolves.toBeUndefined();
  expect(onPage.mock.calls.map((call) => call.slice(1, 3))).toEqual([
    [0, 2],
    [1, 2],
  ]);
  for (const result of mockCapture.mock.results) {
    const page = await result.value;
    expect(page.release).toHaveBeenCalledTimes(1);
  }
});

test.each([
  [{ error: true }, 'capture-failed'],
  [{ phase: 'error' }, 'capture-failed'],
  [{ phase: 'limit' }, 'image-size-limit'],
] as const)('preserves the source failure for %j', async (value, code) => {
  const { outcome } = await mount();
  await message(value);
  expect(await outcome).toMatchObject({ code });
  expect(mockCapture).not.toHaveBeenCalled();
});

test('unmount while waiting for readiness cancels without starting native capture', async () => {
  const { outcome } = await mount();
  await message({ phase: 'measure' });
  act(() => {
    renderer?.unmount();
    renderer = undefined;
  });
  expect(await outcome).toMatchObject({ name: 'AbortError' });
  expect(mockCapture).not.toHaveBeenCalled();
});

test('effect replay does not cancel a mounted capture request', async () => {
  const { session, outcome } = await mount(true);
  await act(async () => {});
  expect(session.signal.aborted).toBe(false);
  session.abort(new DOMException('Capture cancelled', 'AbortError'));
  expect(await outcome).toMatchObject({ name: 'AbortError' });
});
