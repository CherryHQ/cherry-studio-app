import type { FileOcrEngine } from '@/shared/contracts/localOcr';

import { createLocalOcrModule } from '../createLocalOcrModule';

const mockTemporaryFiles = new Set<string>();
const mockCompletion = jest.fn(async (_params: unknown) => ({
  content: 'Recognized text',
  text: '',
  interrupted: false,
  truncated: false,
  context_full: false,
  stopped_limit: 0,
}));
const mockFormatted = {
  type: 'jinja',
  prompt: 'formatted',
  media_paths: ['file:///cache/page.jpg'],
};
const mockFormat = jest.fn(
  async (_messages: unknown, _template: unknown, _options: unknown) => mockFormatted,
);
const mockVision = jest.fn(async () => true);
const mockRelease = jest.fn(async () => {});
// The pinned library's JSI implementation returns undefined even though its TS type says Promise.
const mockStop = jest.fn(() => undefined);
const mockInit = jest.fn(async (_params: unknown) => ({
  completion: mockCompletion,
  getFormattedChat: mockFormat,
  initMultimodal: mockVision,
  release: mockRelease,
  stopCompletion: mockStop,
}));
const mockReadPages = jest.fn(async (..._args: unknown[]) => ({
  totalPages: 2,
  isTruncated: false,
  pages: [
    { page: 1, text: 'Native body', needsOcr: false, isTruncated: false },
    { page: 2, text: '', needsOcr: true, isTruncated: false },
  ],
}));
const mockRender = jest.fn(async (_source: string, _index: number, output: string) => {
  mockTemporaryFiles.add(output);
  return true;
});
const mockDownload = jest.fn(async () => true);
let mockReady = true;
const mockRemove = jest.fn(async () => {
  mockReady = false;
});
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  TurboModuleRegistry: { get: () => ({}) },
}));
jest.mock('llama.rn', () => ({ initLlama: (params: unknown) => mockInit(params) }));
jest.mock('../createOcrModelDownload', () => ({
  createOcrModelDownload: () => ({
    ensureReady: async () => mockReady,
    isReady: () => mockReady,
    paths: () => ({ model: 'file:///model.gguf', vision: 'file:///vision.gguf' }),
    download: () => mockDownload(),
    remove: () => mockRemove(),
    observe: () => () => {},
    pause: async () => {},
    dispose: async () => {},
  }),
}));
jest.mock('../../../../../modules/pdf-text-extractor', () => ({
  supportsLocalOcrImages: () => true,
  readPdfPages: (...args: unknown[]) => mockReadPages(...args),
  renderPdfPage: (...args: Parameters<typeof mockRender>) => mockRender(...args),
  prepareOcrImage: async (_source: string, output: string) => {
    mockTemporaryFiles.add(output);
  },
}));
jest.mock('expo-file-system', () => {
  const join = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  return {
    Paths: { cache: 'file:///cache' },
    Directory: class {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = join(parts);
      }
      create() {}
    },
    File: class {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = join(parts);
      }
      get exists() {
        return mockTemporaryFiles.has(this.uri);
      }
      delete() {
        mockTemporaryFiles.delete(this.uri);
      }
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockTemporaryFiles.clear();
  mockReady = true;
});

function runtime(initial: FileOcrEngine = 'xiaomi') {
  let engine = initial;
  const preferences = {
    readEngine: () => engine,
    writeEngine: jest.fn(async (value: FileOcrEngine) => {
      engine = value;
    }),
  };
  return { ...createLocalOcrModule(preferences), preferences };
}

test('text pages bypass model loading, while a mixed PDF recognizes only scanned pages', async () => {
  const owner = runtime();
  const engine = (await owner.resolveEngine())!;
  mockReadPages.mockResolvedValueOnce({
    totalPages: 1,
    isTruncated: false,
    pages: [{ page: 1, text: 'Native body', needsOcr: false, isTruncated: false }],
  });
  const text = await engine.extract(
    'file:///text.pdf',
    'pdf',
    new AbortController().signal,
    jest.fn(),
  );
  expect(text.text).toBe('Native body');
  expect(mockInit).not.toHaveBeenCalled();

  const mixed = await engine.extract(
    'file:///mixed.pdf',
    'pdf',
    new AbortController().signal,
    jest.fn(),
  );
  expect(mixed.text).toBe('Native body\n\nRecognized text');
  expect(mockRender).toHaveBeenCalledTimes(1);
  expect(mockRender.mock.calls[0]![1]).toBe(1);
  expect(mockRelease).toHaveBeenCalledTimes(1);
  expect(mockTemporaryFiles.size).toBe(0);
  await owner.dispose();
});

test('cancelling during asynchronous formatting never starts generation and still releases memory', async () => {
  const owner = runtime();
  const engine = (await owner.resolveEngine())!;
  let started!: () => void;
  let finish!: (value: typeof mockFormatted) => void;
  const starting = new Promise<void>((resolve) => {
    started = resolve;
  });
  mockFormat.mockImplementationOnce(() => {
    started();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const controller = new AbortController();
  const reading = engine.extract('file:///image.jpg', 'image', controller.signal, jest.fn());
  const rejected = expect(reading).rejects.toThrow('cancel image');
  await starting;
  controller.abort(new Error('cancel image'));
  finish(mockFormatted);
  await rejected;
  expect(mockCompletion).not.toHaveBeenCalled();
  expect(mockRelease).toHaveBeenCalledTimes(1);
  expect(mockTemporaryFiles.size).toBe(0);
  await owner.dispose();
});

test('vision initialization failure returns no partial text and releases the language model', async () => {
  const owner = runtime();
  const engine = (await owner.resolveEngine())!;
  mockVision.mockResolvedValueOnce(false);
  const result = await engine.extract(
    'file:///image.jpg',
    'image',
    new AbortController().signal,
    jest.fn(),
  );
  expect(result).toMatchObject({ text: '', ocrError: true, extractionError: true });
  expect(mockCompletion).not.toHaveBeenCalled();
  expect(mockRelease).toHaveBeenCalledTimes(1);
  expect(mockTemporaryFiles.size).toBe(0);
  await owner.dispose();
});

test('model output limits remain visible as truncation metadata', async () => {
  const owner = runtime();
  const engine = (await owner.resolveEngine())!;
  mockCompletion.mockResolvedValueOnce({
    content: 'Partial text',
    text: '',
    interrupted: false,
    truncated: false,
    context_full: false,
    stopped_limit: 1,
  });
  const result = await engine.extract(
    'file:///image.jpg',
    'image',
    new AbortController().signal,
    jest.fn(),
  );
  expect(result).toMatchObject({ text: 'Partial text', isTruncated: true, ocrError: false });
  await owner.dispose();
});

test('download enables local recognition and deleting the model restores the system engine', async () => {
  const owner = runtime('system');
  expect(await owner.resolveEngine()).toBeUndefined();
  await owner.module.download();
  expect(owner.preferences.readEngine()).toBe('xiaomi');
  expect(await owner.resolveEngine()).toBeDefined();
  await owner.module.remove();
  expect(owner.preferences.readEngine()).toBe('system');
  expect(await owner.resolveEngine()).toBeUndefined();
  await owner.dispose();
});

test('explicit table extraction renders the selected text page and retains its real page number', async () => {
  const owner = runtime();
  const engine = (await owner.resolveEngine())!;
  const signal = new AbortController().signal;
  mockReadPages.mockResolvedValueOnce({
    totalPages: 12,
    isTruncated: false,
    pages: [{ page: 7, text: 'Existing text layer', needsOcr: false, isTruncated: false }],
  });
  mockCompletion.mockResolvedValueOnce({
    content: '<fcel>001<fcel>12.00<nl>',
    text: '',
    interrupted: false,
    truncated: false,
    context_full: false,
    stopped_limit: 0,
  });
  const result = await engine.extract('file:///table.pdf', 'pdf', signal, jest.fn(), {
    task: 'tables',
    pages: [7],
  });
  expect(mockReadPages).toHaveBeenCalledWith('file:///table.pdf', 7, expect.anything(), [7]);
  expect(mockRender.mock.calls[0]![1]).toBe(6);
  expect(result.pages?.[0]).toMatchObject({
    engine: 'xiaomi',
    location: { page: 7 },
    status: 'complete',
    tables: [
      {
        rowCount: 1,
        columnCount: 2,
        cells: [
          { text: '001', row: 0, column: 0 },
          { text: '12.00', row: 0, column: 1 },
        ],
      },
    ],
  });
  expect(mockRelease).toHaveBeenCalledTimes(1);
  await owner.dispose();
});

test('field extraction uses its own constrained prompt and preserves strings and missing values', async () => {
  const owner = runtime();
  const engine = (await owner.resolveEngine())!;
  mockCompletion.mockResolvedValueOnce({
    content: '{"invoice":"0012","amount":"12.00","tax":null}',
    text: '',
    interrupted: false,
    truncated: false,
    context_full: false,
    stopped_limit: 0,
  });
  const result = await engine.extract(
    'file:///receipt.png',
    'image',
    new AbortController().signal,
    jest.fn(),
    { task: 'fields', fields: ['invoice', 'amount', 'tax'] },
  );
  const messages = JSON.stringify(mockFormat.mock.calls[0]![0]);
  expect(messages).toContain('Extract key information');
  expect(messages).not.toContain('ignoring headers and footers');
  const completion = mockCompletion.mock.calls[0]![0] as { json_schema: string };
  expect(JSON.parse(completion.json_schema)).toMatchObject({
    required: ['invoice', 'amount', 'tax'],
    additionalProperties: false,
    properties: { invoice: { type: ['string', 'null'] } },
  });
  expect(result.pages?.[0]).toMatchObject({
    fields: { invoice: '0012', amount: '12.00', tax: null },
    status: 'complete',
  });
  await owner.dispose();
});
