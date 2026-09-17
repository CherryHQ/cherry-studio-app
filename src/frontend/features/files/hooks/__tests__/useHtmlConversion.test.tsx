import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { HtmlCaptureInput } from '@/frontend/components/HtmlCapture';
import type {
  HtmlConversionContext,
  HtmlConversionFormat,
  HtmlConversionInput,
} from '@/shared/contracts/documentExport';
import type { FileExportOptions } from '@/shared/contracts/fileExport';
import { FileEntrySchema } from '@/shared/data/types/file';

import { useHtmlConversion } from '../useHtmlConversion';

const mockPrepareImage = jest.fn();
const mockReadDimensions = jest.fn();
const mockRelease = jest.fn();
const mockPersistPage = jest.fn();
const mockConvertHtml = jest.fn();
const mockShare = jest.fn();
const mockDelivered = jest.fn();
const mockToast = jest.fn();
const mockCaptureHtml = jest.fn();
let mockFinishCapture: () => void;
let mockFailCapture: (error: unknown) => void;

jest.mock('@/frontend/appShell/fileExport', () => ({
  prepareImageExport: (...args: unknown[]) => mockPrepareImage(...args),
  useExportWatermark:
    (style = 'cherry') =>
    () =>
      style === 'none'
        ? { kind: 'none' }
        : {
            kind: 'cherry',
            signature: { brandName: 'Cherry Studio', timestamp: '2026.09.17 12:00' },
          },
  shareFile: (...args: unknown[]) => mockShare(...args),
  FileSharingError: class extends Error {},
}));
jest.mock('@/frontend/utils/capturePng', () => ({
  readPngDimensions: (uri: string) => mockReadDimensions(uri),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ convertHtml: mockConvertHtml }),
}));
jest.mock('@/frontend/components/HtmlCapture', () => ({
  useHtmlCapture: () => ({ capture: mockCaptureHtml, surface: null }),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ warn: jest.fn() }) },
}));

const page = { uri: 'file:///capture.png', width: 1280, height: 720, release() {} };
const signed = { uri: 'file:///signed.png', release: mockRelease };
const savedFile = {
  uri: 'file:///managed/page.png',
  entry: FileEntrySchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'page.png',
    mediaType: 'image/png',
    provenance: 'document-export',
    createdAt: 1,
    updatedAt: 1,
    size: 1000,
  }),
};
let actions: ReturnType<typeof useHtmlConversion>;
let renderer: ReactTestRenderer;

function Probe({ options }: { options?: FileExportOptions }) {
  const currentActions = useHtmlConversion(options);
  useEffect(() => {
    actions = currentActions;
  }, [currentActions]);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockShare.mockReset().mockImplementation(async (source) => {
    const file = typeof source === 'function' ? await source() : source;
    mockDelivered(file);
  });
  mockPrepareImage.mockReset().mockResolvedValue(signed);
  mockReadDimensions.mockReset().mockReturnValue({ width: 1280, height: 920 });
  mockPersistPage.mockReset().mockResolvedValue(undefined);
  mockCaptureHtml.mockReset().mockImplementation(
    () =>
      new Promise<void>((resolve, reject) => {
        mockFinishCapture = resolve;
        mockFailCapture = reject;
      }),
  );
  mockConvertHtml.mockImplementation(
    async (input: HtmlConversionInput, context: HtmlConversionContext) => {
      await input.capture({
        format: input.format,
        signal: context.signal!,
        onPage: mockPersistPage,
      });
      return savedFile;
    },
  );
  act(() => {
    renderer = create(<Probe />);
  });
});
afterEach(() => act(() => renderer.unmount()));

test.each(['image', 'pptx'] as const)(
  'defaults %s to Cherry and delivers the completed file',
  async (format) => {
    const { request, sharing } = await start(format);
    await act(async () => {
      await deliver(request);
      await sharing;
    });
    expect(mockPrepareImage).toHaveBeenCalledWith(page, {
      kind: 'cherry',
      signature: expect.objectContaining({
        brandName: 'Cherry Studio',
        timestamp: expect.any(String),
      }),
    });
    expect(mockReadDimensions).toHaveBeenCalledWith(signed.uri);
    expect(mockPersistPage).toHaveBeenCalledWith(
      expect.objectContaining({ uri: signed.uri, width: 1280, height: 920 }),
      0,
      1,
    );
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith(expect.any(Function), {
      watermark: mockPrepareImage.mock.calls[0][1],
      signal: expect.any(AbortSignal),
    });
    expect(mockDelivered).toHaveBeenCalledWith(savedFile);
  },
);

test.each(['image', 'pptx'] as const)(
  'keeps %s captures unchanged when watermark is none',
  async (format) => {
    act(() => renderer.update(<Probe options={{ watermark: 'none' }} />));
    const { request, sharing } = await start(format);
    await act(async () => {
      await deliver(request);
      await sharing;
    });
    expect(mockPersistPage).toHaveBeenCalledWith(page, 0, 1);
    expect(mockPrepareImage).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockShare).toHaveBeenCalledWith(expect.any(Function), {
      watermark: { kind: 'none' },
      signal: expect.any(AbortSignal),
    });
  },
);

test('releases the signed temporary file when persistence fails', async () => {
  mockPersistPage.mockRejectedValueOnce(new Error('Storage failed'));
  const { request, sharing } = await start('image');
  await act(async () => {
    await deliver(request);
    await sharing;
  });
  expect(mockRelease).toHaveBeenCalledTimes(1);
  expect(mockDelivered).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith({
    label: 'fileViewer.conversion.failed',
    variant: 'danger',
  });
});

test('adds the PPT footer only to the final slide without creating another slide', async () => {
  const first = { ...page, uri: 'file:///first-slide.png' };
  const last = { ...page, uri: 'file:///last-slide.png' };
  const { request, sharing } = await start('pptx');
  await act(async () => {
    await request.onPage(first, 0, 2, request.signal);
    await request.onPage(last, 1, 2, request.signal);
    mockFinishCapture();
    await sharing;
  });
  expect(mockPrepareImage).toHaveBeenCalledTimes(1);
  expect(mockPrepareImage).toHaveBeenCalledWith(last, expect.objectContaining({ kind: 'cherry' }));
  expect(mockPersistPage.mock.calls).toEqual([
    [first, 0, 2],
    [expect.objectContaining({ uri: signed.uri, width: 1280, height: 920 }), 1, 2],
  ]);
  expect(mockRelease).toHaveBeenCalledTimes(1);
});

test('cancellation during signing releases its late output without saving or sharing it', async () => {
  let finishSigning!: (value: typeof signed) => void;
  mockPrepareImage.mockReturnValueOnce(
    new Promise((resolve) => {
      finishSigning = resolve;
    }),
  );
  const { request, sharing } = await start('image');
  let delivery!: Promise<void>;
  act(() => {
    delivery = deliver(request);
    actions.cancel();
  });
  await act(async () => {
    finishSigning(signed);
    await delivery;
    await sharing;
  });
  expect(mockRelease).toHaveBeenCalledTimes(1);
  expect(mockPersistPage).not.toHaveBeenCalled();
  expect(mockDelivered).not.toHaveBeenCalled();
});

async function start(format: HtmlConversionFormat) {
  let sharing!: Promise<void>;
  await act(async () => {
    sharing = actions.share('<html/>', 'page.html', format);
  });
  return { request: mockCaptureHtml.mock.calls[0][0] as HtmlCaptureInput, sharing };
}

async function deliver(request: HtmlCaptureInput) {
  try {
    await request.onPage(page, 0, 1, request.signal);
    mockFinishCapture();
  } catch (error) {
    mockFailCapture(error);
  }
}
