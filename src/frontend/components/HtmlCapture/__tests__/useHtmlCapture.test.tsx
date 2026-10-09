import { createRef, useImperativeHandle, type Ref } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CapturedHtmlPage } from '@/shared/contracts/documentExport';

import type { HtmlCaptureRequest } from '../HtmlCaptureSurface';
import type { HtmlCaptureInput } from '../types';
import { useHtmlCapture } from '../useHtmlCapture';

jest.mock('../HtmlCaptureSurface', () => ({ HtmlCaptureSurface: () => null }));

type Capture = ReturnType<typeof useHtmlCapture>;
function Probe({ ref }: { ref: Ref<Capture> }) {
  const capture = useHtmlCapture();
  useImperativeHandle(ref, () => capture, [capture]);
  return capture.surface;
}

const source: HtmlCaptureInput['source'] = () => ({
  html: '<main>Content</main>',
  viewport: { width: 360, height: 1 },
  contentMode: 'mobile',
  setupScript: '',
  timeout: { pageMs: 60_000 },
  maxMessageLength: 1024,
  readFrames: () => [],
});
let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

test('unmount cancels capture but waits for its late native file to be released', async () => {
  const ref = createRef<Capture>();
  act(() => {
    renderer = create(<Probe ref={ref} />);
  });
  let resolveNative!: (page: CapturedHtmlPage) => void;
  const native = new Promise<CapturedHtmlPage>((resolve) => {
    resolveNative = resolve;
  });
  const onPage = jest.fn();
  let outcome!: Promise<unknown>;
  let completed = false;
  await act(async () => {
    outcome = ref
      .current!.capture({ source, signal: new AbortController().signal, onPage })
      .catch((error: unknown) => error)
      .then((value) => {
        completed = true;
        return value;
      });
  });
  const request = ref.current!.surface!.props.request as HtmlCaptureRequest;
  await act(async () => {
    request.session.run([{ width: 1080, height: 700, script: '' }], {
      prepare: async () => {},
      capture: () => native,
    });
  });
  act(() => {
    renderer?.unmount();
    renderer = undefined;
  });
  expect(request.session.signal.aborted).toBe(true);
  expect(completed).toBe(false);
  const page = { uri: 'file:///late.png', width: 1080, height: 700, release: jest.fn() };
  resolveNative(page);
  expect(await outcome).toMatchObject({ name: 'AbortError' });
  expect(page.release).toHaveBeenCalledTimes(1);
  expect(onPage).not.toHaveBeenCalled();
});

test('a capture started just before unmount cannot attach a surface afterward', async () => {
  const ref = createRef<Capture>();
  act(() => {
    renderer = create(<Probe ref={ref} />);
  });
  const capture = ref.current!.capture;
  let outcome!: Promise<unknown>;
  act(() => {
    outcome = capture({ source, signal: new AbortController().signal, onPage: jest.fn() }).catch(
      (error: unknown) => error,
    );
    renderer?.unmount();
    renderer = undefined;
  });
  expect(await outcome).toMatchObject({ name: 'AbortError' });
  await expect(
    capture({ source, signal: new AbortController().signal, onPage: jest.fn() }),
  ).rejects.toMatchObject({ code: 'disposed' });
});
