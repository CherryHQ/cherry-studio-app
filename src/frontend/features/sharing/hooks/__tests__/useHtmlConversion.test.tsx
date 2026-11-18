import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { HtmlCaptureInput } from '@/frontend/components/HtmlCapture';
import type {
  HtmlConversionArtifact,
  HtmlConversionContext,
  HtmlConversionInput,
  HtmlConversionFormat,
} from '@/shared/contracts/documentExport';
import type { ExportWatermark } from '@/shared/contracts/fileExport';
import { FileEntrySchema } from '@/shared/data/types/file';

import { useHtmlConversion } from '../useHtmlConversion';

const mockPrepareImage = jest.fn();
const mockReadDimensions = jest.fn();
const mockRelease = jest.fn();
const mockPersistPage = jest.fn();
const mockConvertHtml = jest.fn<
  Promise<HtmlConversionArtifact>,
  [HtmlConversionInput, HtmlConversionContext?]
>();
const mockCapture = jest.fn<Promise<void>, [HtmlCaptureInput]>();
const mockCleanups: (() => Promise<unknown>)[] = [];
let mockFinishCapture: () => void;
let mockFailCapture: (error: unknown) => void;

jest.mock('@/frontend/appShell/fileExport', () => ({
  prepareImageExport: (...args: unknown[]) => mockPrepareImage(...args),
}));
jest.mock('@/frontend/appShell/sharing', () => ({
  registerShareCleanup: (_id: string, cleanup: () => Promise<unknown>) =>
    mockCleanups.push(cleanup),
  retainShareOperation: (_id: string, operation: Promise<unknown>) => operation,
}));
jest.mock('@/frontend/utils/capturePng', () => ({
  readPngDimensions: (uri: string) => mockReadDimensions(uri),
}));
jest.mock('@/frontend/utils/readFileText', () => ({
  readFileText: () => ({ text: '<main>Content</main>', isTruncated: false }),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ convertHtml: mockConvertHtml }),
}));
jest.mock('@/frontend/components/HtmlCapture', () => ({
  useHtmlCapture: () => ({ capture: mockCapture, surface: null }),
}));

const page = { uri: 'file:///capture.png', width: 1280, height: 720, release() {} };
const signed = { uri: 'file:///signed.png', release: mockRelease };
const source = {
  uri: 'file:///page.html',
  entry: FileEntrySchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'page.html',
    mediaType: 'text/html',
    provenance: 'document-export',
    createdAt: 1,
    updatedAt: 1,
    size: 1000,
  }),
};
const watermark: ExportWatermark = {
  kind: 'cherry',
  signature: {
    background: 'white',
    foreground: 'black',
    brandColor: 'red',
    logoDataUrl: 'data:image/png;base64,AA==',
    brandName: 'Cherry Studio',
    downloadLabel: 'Scan',
    downloadLinkLabel: 'Download',
    downloadUrl: 'https://example.com',
    qrCodeDataUrl: 'data:image/png;base64,AA==',
  },
};
const artifact: HtmlConversionArtifact = {
  file: { uri: 'file:///converted.png', filename: 'converted.png', mediaType: 'image/png' },
  pages: [
    {
      file: { uri: 'file:///converted.png', filename: 'converted.png', mediaType: 'image/png' },
      width: 1280,
      height: 720,
    },
  ],
  save: jest.fn(),
  dispose: jest.fn(async () => {}),
};
type Actions = ReturnType<typeof useHtmlConversion>;
let renderer: ReactTestRenderer | undefined;
const ref = createRef<Actions>();
function Probe({ ref }: { ref: Ref<Actions> }) {
  const value = useHtmlConversion('request');
  useImperativeHandle(ref, () => value, [value]);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCleanups.length = 0;
  mockPrepareImage.mockResolvedValue(signed);
  mockReadDimensions.mockReturnValue({ width: 1280, height: 920 });
  mockCapture.mockImplementation(
    () =>
      new Promise<void>((resolve, reject) => {
        mockFinishCapture = resolve;
        mockFailCapture = reject;
      }),
  );
  mockConvertHtml.mockImplementation(async (input, context) => {
    await input.capture({
      format: input.format,
      signal: context!.signal!,
      onPage: mockPersistPage,
    });
    return artifact;
  });
  act(() => {
    renderer = create(<Probe ref={ref} />);
  });
});
afterEach(async () => {
  act(() => renderer?.unmount());
  await Promise.allSettled(mockCleanups.map((cleanup) => cleanup()));
  renderer = undefined;
});

async function start(
  format: HtmlConversionFormat,
  style: ExportWatermark = watermark,
  signal = new AbortController().signal,
) {
  let operation!: Promise<HtmlConversionArtifact>;
  await act(async () => {
    operation = ref.current!.convert(source, format, style, signal);
  });
  return { operation, request: mockCapture.mock.calls[0][0] };
}
async function deliver(request: HtmlCaptureInput) {
  try {
    await request.onPage(page, 0, 1, request.signal);
    mockFinishCapture();
  } catch (error) {
    mockFailCapture(error);
  }
}

test.each(['image', 'pptx'] as const)(
  'prepares %s without permanent storage and releases its signed capture',
  async (format) => {
    const { operation, request } = await start(format);
    await act(async () => {
      await deliver(request);
      await operation;
    });
    expect(await operation).toBe(artifact);
    expect(artifact.save).not.toHaveBeenCalled();
    expect(mockPrepareImage).toHaveBeenCalledWith(page, watermark);
    expect(mockPersistPage).toHaveBeenCalledWith(
      expect.objectContaining({ uri: signed.uri, width: 1280, height: 920 }),
      0,
      1,
    );
    expect(mockRelease).toHaveBeenCalledTimes(1);
  },
);

test.each(['image', 'pptx'] as const)(
  'keeps %s capture bytes unchanged when watermark is none',
  async (format) => {
    const { operation, request } = await start(format, { kind: 'none' });
    await act(async () => {
      await deliver(request);
      await operation;
    });
    expect(mockPersistPage).toHaveBeenCalledWith(page, 0, 1);
    expect(mockPrepareImage).not.toHaveBeenCalled();
  },
);

test('PPT signs only the final existing slide', async () => {
  const { operation, request } = await start('pptx');
  const last = { ...page, uri: 'file:///last.png' };
  await act(async () => {
    await request.onPage(page, 0, 2, request.signal);
    await request.onPage(last, 1, 2, request.signal);
    mockFinishCapture();
    await operation;
  });
  expect(mockPrepareImage).toHaveBeenCalledTimes(1);
  expect(mockPrepareImage).toHaveBeenCalledWith(last, watermark);
  expect(mockPersistPage.mock.calls).toEqual([
    [page, 0, 2],
    [expect.objectContaining({ uri: signed.uri }), 1, 2],
  ]);
});

test('the same source, format and watermark reuse the temporary artifact', async () => {
  const { operation, request } = await start('image');
  await act(async () => {
    await deliver(request);
    await operation;
  });
  await expect(
    ref.current!.convert(source, 'image', watermark, new AbortController().signal),
  ).resolves.toBe(artifact);
  expect(mockConvertHtml).toHaveBeenCalledTimes(1);
  expect(mockCapture).toHaveBeenCalledTimes(1);
});

test('cancellation during signing releases late pixels and never publishes the page', async () => {
  let finish!: (value: typeof signed) => void;
  mockPrepareImage.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const { operation, request } = await start('image', watermark, controller.signal);
  const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
  let delivered!: Promise<void>;
  await act(async () => {
    delivered = deliver(request);
  });
  controller.abort();
  await act(async () => {
    finish(signed);
    await delivered;
    await rejected;
  });
  expect(mockRelease).toHaveBeenCalledTimes(1);
  expect(mockPersistPage).not.toHaveBeenCalled();
  expect(artifact.save).not.toHaveBeenCalled();
});
