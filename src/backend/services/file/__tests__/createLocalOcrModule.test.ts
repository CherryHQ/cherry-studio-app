import type { FileOcrEngine, LocalOcrModelId } from '@/shared/contracts/localOcr';

import { createLocalOcrModule } from '../createLocalOcrModule';
import { LOCAL_OCR_MODELS, type LocalOcrModel } from '../localOcrModel';

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
const mockDownload = jest.fn(async (_model: LocalOcrModelId) => true);
const mockReady = { xiaomi: true, ovis: true };
const mockRemove = jest.fn(async (model: LocalOcrModelId) => {
  mockReady[model] = false;
});
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  TurboModuleRegistry: { get: () => ({}) },
}));
jest.mock('llama.rn', () => ({ initLlama: (params: unknown) => mockInit(params) }));
jest.mock('../createOcrModelDownload', () => ({
  createOcrModelDownload: (config: LocalOcrModel) => {
    const model: LocalOcrModelId = config.version.startsWith('ovis-') ? 'ovis' : 'xiaomi';
    return {
      ensureReady: async () => mockReady[model],
      isReady: () => mockReady[model],
      paths: () => ({
        model: `file:///${model}/model.gguf`,
        vision: `file:///${model}/vision.gguf`,
      }),
      download: () => mockDownload(model),
      remove: () => mockRemove(model),
      observe: () => () => {},
      pause: async () => {},
      dispose: async () => {},
    };
  },
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
  mockReady.xiaomi = true;
  mockReady.ovis = true;
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
  await owner.module.download('xiaomi');
  expect(owner.preferences.readEngine()).toBe('xiaomi');
  expect(await owner.resolveEngine()).toBeDefined();
  await owner.module.remove('xiaomi');
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

test('Ovis uses its own weights, prompt, structured HTML output and cache identity', async () => {
  const owner = runtime('ovis');
  const engine = (await owner.resolveEngine())!;
  expect(engine.cacheKey).toBe(LOCAL_OCR_MODELS.ovis.version);
  expect(engine.cacheKey).not.toBe(LOCAL_OCR_MODELS.xiaomi.version);
  const raw = '<table><tr><td>001</td><td>12.00</td></tr></table>';
  mockCompletion.mockResolvedValueOnce({
    content: raw,
    text: '',
    interrupted: false,
    truncated: false,
    context_full: false,
    stopped_limit: 0,
  });
  const result = await engine.extract(
    'file:///table.png',
    'image',
    new AbortController().signal,
    jest.fn(),
    { task: 'tables' },
  );
  expect(mockInit).toHaveBeenCalledWith(
    expect.objectContaining({ model: 'file:///ovis/model.gguf' }),
  );
  expect(mockVision).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'file:///ovis/vision.gguf' }),
  );
  const messages = JSON.stringify(mockFormat.mock.calls[0]![0]);
  expect(messages).toContain('Format tables as HTML');
  expect(messages).not.toContain('OTSL');
  expect(result.pages?.[0]).toMatchObject({
    engine: 'ovis',
    raw,
    status: 'complete',
    tables: [{ cells: [{ text: '001' }, { text: '12.00' }] }],
  });
  expect(mockRelease).toHaveBeenCalledTimes(1);
  await owner.dispose();
});

test('Ovis fields use its schema prompt, retaining exact strings and normalizing missing values', async () => {
  const owner = runtime('ovis');
  const engine = (await owner.resolveEngine())!;
  mockCompletion.mockResolvedValueOnce({
    content: '{"id":"0001","missing":""}',
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
    { task: 'fields', fields: ['id', 'missing'] },
  );
  expect(JSON.stringify(mockFormat.mock.calls[0]![0])).toContain('using exactly this JSON schema');
  expect(result.pages?.[0]).toMatchObject({
    engine: 'ovis',
    fields: { id: '0001', missing: null },
    status: 'complete',
  });
  await owner.dispose();
});

test('Ovis question answers preserve raw reasoning and project only the final answer', async () => {
  const owner = runtime('ovis');
  const engine = (await owner.resolveEngine())!;
  const raw = 'The invoice shows 12.00. \\boxed{12.00}';
  mockCompletion.mockResolvedValueOnce({
    content: raw,
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
    { task: 'question', question: 'Total?' },
  );
  expect(result.pages?.[0]).toMatchObject({
    engine: 'ovis',
    raw,
    text: '12.00',
    answer: '12.00',
    status: 'complete',
  });
  await owner.dispose();
});

test('removing an inactive model preserves the selected engine; removing the selected one restores system', async () => {
  const owner = runtime('system');
  await owner.module.download('ovis');
  expect(owner.preferences.readEngine()).toBe('ovis');
  await owner.module.remove('xiaomi');
  expect(owner.preferences.readEngine()).toBe('ovis');
  expect((await owner.resolveEngine())?.cacheKey).toBe(LOCAL_OCR_MODELS.ovis.version);
  await owner.module.remove('ovis');
  expect(owner.preferences.readEngine()).toBe('system');
  expect(await owner.resolveEngine()).toBeUndefined();
  await owner.dispose();
});

test('a missing Ovis download falls back to system and cannot be supplied by Xiaomi files', async () => {
  mockReady.ovis = false;
  const owner = runtime('ovis');
  expect(await owner.resolveEngine()).toBeUndefined();
  expect(mockInit).not.toHaveBeenCalled();
  await owner.dispose();
});

test('deleting Ovis while Xiaomi is reading never aborts or releases the active context', async () => {
  const owner = runtime('xiaomi');
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
  const reading = engine.extract(
    'file:///image.jpg',
    'image',
    new AbortController().signal,
    jest.fn(),
  );
  await starting;
  await owner.module.remove('ovis');
  expect(mockStop).not.toHaveBeenCalled();
  expect(mockRelease).not.toHaveBeenCalled();
  expect(owner.preferences.readEngine()).toBe('xiaomi');
  finish(mockFormatted);
  await expect(reading).resolves.toMatchObject({ text: 'Recognized text' });
  await owner.dispose();
});

test('deleting an active Ovis model waits for cancellation and release before removing weights', async () => {
  const owner = runtime('ovis');
  const engine = (await owner.resolveEngine())!;
  let started!: () => void;
  let finish!: (value: typeof mockFormatted) => void;
  let cancelled!: () => void;
  const starting = new Promise<void>((resolve) => {
    started = resolve;
  });
  const cancelling = new Promise<void>((resolve) => {
    cancelled = resolve;
  });
  mockFormat.mockImplementationOnce(() => {
    started();
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  mockStop.mockImplementationOnce(() => {
    cancelled();
    return undefined;
  });
  const reading = engine.extract(
    'file:///image.jpg',
    'image',
    new AbortController().signal,
    jest.fn(),
  );
  const rejected = expect(reading).rejects.toThrow();
  await starting;
  const removing = owner.module.remove('ovis');
  await cancelling;
  expect(mockRemove).not.toHaveBeenCalled();
  finish(mockFormatted);
  await rejected;
  await removing;
  expect(mockCompletion).not.toHaveBeenCalled();
  expect(mockRelease).toHaveBeenCalledTimes(1);
  expect(mockRemove).toHaveBeenCalledWith('ovis');
  expect(owner.preferences.readEngine()).toBe('system');
  await owner.dispose();
});

test('an Ovis crop placeholder alone is not a complete text extraction', async () => {
  const owner = runtime('ovis');
  const engine = (await owner.resolveEngine())!;
  const raw = '<img src="images/bbox_1_2_3_4.jpg" />';
  mockCompletion.mockResolvedValueOnce({
    content: raw,
    text: '',
    interrupted: false,
    truncated: false,
    context_full: false,
    stopped_limit: 0,
  });
  const result = await engine.extract(
    'file:///image.jpg',
    'image',
    new AbortController().signal,
    jest.fn(),
  );
  expect(result.pages?.[0]).toMatchObject({ raw, text: '', status: 'unrecognized' });
  expect(result.unrecognizedPages).toEqual([1]);
  await owner.dispose();
});
