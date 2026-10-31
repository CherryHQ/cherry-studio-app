import { File } from 'expo-file-system';

import {
  extractImageText,
  extractPdfText,
  type ExtractResult,
} from '../../../../../modules/pdf-text-extractor';
import { readFileTextCache, writeFileTextCache } from '../fileTextCache';
import {
  configureFileOcrLanguage,
  configureFileOcrEngine,
  linkFileOcr,
  observeFileOcr,
  readPdfText,
  readImageText,
  readDocumentPages,
  type FileTextEngine,
} from '../fileTextExtraction';

jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('../../../../../modules/pdf-text-extractor', () => ({
  extractPdfText: jest.fn(),
  extractImageText: jest.fn(),
}));
jest.mock('../fileTextCache', () => ({
  fileTextCacheFile: (
    source: File,
    language: string,
    _kind: string,
    engine?: string,
    request?: string,
  ) => ({
    uri: `${source.uri}.${language}${engine ? `.${engine}` : ''}${request ? `.${request}` : ''}.cache`,
  }),
  readFileTextCache: jest.fn(),
  writeFileTextCache: jest.fn(),
}));
const ID = '00000000-0000-7000-8000-000000000001';
const OTHER_ID = '00000000-0000-7000-8000-000000000002';
const managed = (id: string) =>
  ({ uri: `file:///managed/${id}.pdf`, name: `${id}.pdf`, exists: true }) as File;
const source = managed(ID);
const result: ExtractResult = {
  text: '扫描文字',
  totalPages: 2,
  extractedPages: 2,
  isTruncated: false,
  extractionError: false,
  ocrError: false,
  ocrUnavailable: false,
  unrecognizedPages: [],
};
const signal = () => new AbortController().signal;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
beforeEach(() => {
  jest.clearAllMocks();
  configureFileOcrEngine(async () => undefined);
  jest.mocked(readFileTextCache).mockResolvedValue(undefined);
  jest.mocked(extractPdfText).mockResolvedValue(result);
  jest.mocked(extractImageText).mockResolvedValue({ ...result, totalPages: 1, extractedPages: 1 });
});

test('a consumer can cancel while the local model availability check is still pending', async () => {
  const checking = deferred<undefined>();
  configureFileOcrEngine(() => checking.promise);
  const controller = new AbortController();
  const reading = readPdfText(source, controller.signal);
  const rejected = expect(reading).rejects.toThrow('cancelled check');
  controller.abort(new Error('cancelled check'));
  await rejected;
  checking.resolve(undefined);
  await Promise.resolve();
  expect(extractPdfText).not.toHaveBeenCalled();
});

test('image consumers share one recognition and reuse its disk result after an independent cancellation', async () => {
  const image = { ...source, uri: `file:///managed/${ID}.png`, name: `${ID}.png` } as File;
  const disk = new Map<string, ExtractResult>();
  jest.mocked(readFileTextCache).mockImplementation(async (file) => disk.get(file.uri));
  jest.mocked(writeFileTextCache).mockImplementation((file, value) => {
    disk.set(file.uri, value);
  });
  const started = deferred<AbortSignal>();
  const native = deferred<ExtractResult>();
  const states = jest.fn();
  const stop = observeFileOcr(ID, states);
  jest.mocked(extractImageText).mockImplementationOnce((_uri, _options, control) => {
    control!.onProgress!({ requestId: 'image', completedPages: 0, totalPages: 1, phase: 'ocr' });
    started.resolve(control!.signal!);
    return native.promise;
  });
  const controller = new AbortController();
  const first = readImageText(image, controller.signal);
  const second = readImageText(image, signal());
  const nativeSignal = await started.promise;
  const stopped = expect(first).rejects.toThrow('stopped');
  controller.abort(new Error('stopped'));
  await stopped;
  expect(nativeSignal.aborted).toBe(false);
  const recognized = { ...result, totalPages: 1, extractedPages: 1 };
  native.resolve(recognized);
  await expect(second).resolves.toEqual(recognized);
  await expect(readImageText(image, signal())).resolves.toEqual(recognized);
  expect(extractImageText).toHaveBeenCalledTimes(1);
  expect(extractPdfText).not.toHaveBeenCalled();
  expect(states.mock.calls).toContainEqual([
    { status: 'recognizing', kind: 'image', completedPages: 0, totalPages: 1 },
  ]);
  expect(states.mock.lastCall).toEqual([undefined]);
  stop();
});

test('empty image recognition is cached, while an unsupported language is not', async () => {
  const empty = { ...result, text: '', unrecognizedPages: [1] };
  jest.mocked(extractImageText).mockResolvedValueOnce(empty);
  await readImageText(source, signal());
  expect(writeFileTextCache).toHaveBeenCalledWith(expect.anything(), empty);
  jest.mocked(writeFileTextCache).mockClear();
  jest.mocked(extractImageText).mockResolvedValueOnce({ ...empty, ocrUnavailable: true });
  await readImageText(source, signal());
  expect(writeFileTextCache).not.toHaveBeenCalled();
});

test('later turns and tool reads reuse persisted text without starting OCR', async () => {
  const disk = new Map<string, ExtractResult>();
  jest.mocked(readFileTextCache).mockImplementation(async (file) => disk.get(file.uri));
  jest.mocked(writeFileTextCache).mockImplementation((file, value) => {
    disk.set(file.uri, value);
  });
  await expect(readPdfText(source, signal())).resolves.toEqual(result);
  await expect(readPdfText(source, signal())).resolves.toEqual(result);
  expect(extractPdfText).toHaveBeenCalledTimes(1);
});

test('history re-reads of cached results show no recognition activity on the file', async () => {
  const states = jest.fn();
  const stop = observeFileOcr(ID, states);
  jest.mocked(readFileTextCache).mockResolvedValueOnce({ ...result, unrecognizedPages: [2] });
  await expect(readPdfText(source, signal())).resolves.toMatchObject({ unrecognizedPages: [2] });
  expect(extractPdfText).not.toHaveBeenCalled();
  expect(states.mock.calls).toEqual([[undefined]]);
  stop();
});

test('a linked read_file call follows the file it resolved until unlinked', async () => {
  const native = deferred<ExtractResult>();
  const states = jest.fn();
  const stop = observeFileOcr('call-1', states);
  jest.mocked(extractPdfText).mockImplementationOnce((_uri, _options, control) => {
    control!.onProgress!({ requestId: 'request', completedPages: 1, totalPages: 3, phase: 'ocr' });
    return native.promise;
  });
  const unlink = linkFileOcr('call-1', ID);
  const read = readPdfText(source, signal());
  await Promise.resolve();
  await Promise.resolve();
  native.resolve(result);
  await read;
  unlink();
  expect(states.mock.calls).toEqual([
    [undefined],
    [undefined],
    [{ status: 'recognizing', kind: 'pdf', completedPages: 1, totalPages: 3 }],
    [undefined],
    [undefined],
  ]);
  stop();
});

test('recognizes in the resolved app language and keys results by it', async () => {
  configureFileOcrLanguage(() => 'ru-RU');
  try {
    await readPdfText(source, signal());
    expect(extractPdfText).toHaveBeenCalledWith(
      source.uri,
      expect.objectContaining({ language: 'ru-RU' }),
      expect.anything(),
    );
    expect(writeFileTextCache).toHaveBeenCalledWith({ uri: `${source.uri}.ru-RU.cache` }, result);
  } finally {
    configureFileOcrLanguage(() => 'en-US');
  }
});

test('a shared extraction survives one caller cancelling and reports its file once', async () => {
  const started = deferred<AbortSignal>();
  const native = deferred<ExtractResult>();
  const states = jest.fn();
  const others = jest.fn();
  const stop = observeFileOcr(ID, states);
  const stopOthers = observeFileOcr(OTHER_ID, others);
  jest.mocked(extractPdfText).mockImplementationOnce((_uri, _options, control) => {
    started.resolve(control!.signal!);
    control!.onProgress!({ requestId: 'request', completedPages: 0, totalPages: 2, phase: 'ocr' });
    return native.promise;
  });
  const controller = new AbortController();
  const first = readPdfText(source, controller.signal);
  const second = readPdfText(source, signal());
  const nativeSignal = await started.promise;
  const stopped = expect(first).rejects.toThrow('stopped');
  controller.abort(new Error('stopped'));
  await stopped;
  expect(nativeSignal.aborted).toBe(false);
  native.resolve(result);
  await expect(second).resolves.toEqual(result);
  expect(extractPdfText).toHaveBeenCalledTimes(1);
  expect(states.mock.calls).toEqual([
    [undefined],
    [{ status: 'recognizing', kind: 'pdf', completedPages: 0, totalPages: 2 }],
    [undefined],
  ]);
  expect(others.mock.calls).toEqual([[undefined]]);
  stop();
  stopOthers();
});

test('cancels native work only when its last caller leaves and never caches a late result', async () => {
  const started = deferred<AbortSignal>();
  const native = deferred<ExtractResult>();
  jest.mocked(extractPdfText).mockImplementationOnce((_uri, _options, control) => {
    started.resolve(control!.signal!);
    return native.promise;
  });
  const controller = new AbortController();
  const reading = readPdfText(source, controller.signal);
  const nativeSignal = await started.promise;
  const stopped = expect(reading).rejects.toThrow('stopped');
  controller.abort(new Error('stopped'));
  await stopped;
  expect(nativeSignal.aborted).toBe(true);
  native.resolve(result);
  // A new read waits for native cleanup, then starts its own extraction.
  await expect(readPdfText(source, signal())).resolves.toEqual(result);
  expect(extractPdfText).toHaveBeenCalledTimes(2);
  expect(writeFileTextCache).toHaveBeenCalledTimes(1);
});

test('a queued document can be cancelled without starting its native extraction', async () => {
  const started = deferred<void>();
  const native = deferred<ExtractResult>();
  jest.mocked(extractPdfText).mockImplementationOnce(() => {
    started.resolve();
    return native.promise;
  });
  const first = readPdfText(source, signal());
  await started.promise;
  const states = jest.fn();
  const stop = observeFileOcr(OTHER_ID, states);
  const controller = new AbortController();
  const queued = readPdfText(managed(OTHER_ID), controller.signal);
  await new Promise(setImmediate);
  expect(states).toHaveBeenLastCalledWith({ status: 'queued' });
  const stopped = expect(queued).rejects.toThrow('stopped');
  controller.abort(new Error('stopped'));
  await stopped;
  expect(states).toHaveBeenLastCalledWith(undefined);
  native.resolve(result);
  await first;
  expect(extractPdfText).toHaveBeenCalledTimes(1);
  stop();
});

test('an old cancelled read cannot clear its retry queued behind another document', async () => {
  const firstStarted = deferred<void>();
  const otherStarted = deferred<void>();
  const firstNative = deferred<ExtractResult>();
  const otherNative = deferred<ExtractResult>();
  jest
    .mocked(extractPdfText)
    .mockImplementationOnce((_uri, _options, control) => {
      control!.onProgress!({ requestId: 'first', completedPages: 0, totalPages: 2, phase: 'ocr' });
      firstStarted.resolve();
      return firstNative.promise;
    })
    .mockImplementationOnce(() => {
      otherStarted.resolve();
      return otherNative.promise;
    });
  const states = jest.fn();
  const stop = observeFileOcr(ID, states);
  const controller = new AbortController();
  const first = readPdfText(source, controller.signal);
  await firstStarted.promise;
  const other = readPdfText(managed(OTHER_ID), signal());
  await new Promise(setImmediate);
  const stopped = expect(first).rejects.toThrow('stopped');
  controller.abort(new Error('stopped'));
  await stopped;
  const retry = readPdfText(source, signal());
  await new Promise(setImmediate);
  expect(states).toHaveBeenLastCalledWith({ status: 'queued' });

  firstNative.resolve(result);
  await otherStarted.promise;
  expect(states).toHaveBeenLastCalledWith({ status: 'queued' });
  const resumedObserver = jest.fn();
  const stopResumed = observeFileOcr(ID, resumedObserver);
  expect(resumedObserver).toHaveBeenLastCalledWith({ status: 'queued' });

  otherNative.resolve(result);
  await Promise.all([other, retry]);
  expect(states).toHaveBeenLastCalledWith(undefined);
  stopResumed();
  stop();
});

test("queuing and cancelling another language preserves the file's active recognition", async () => {
  const started = deferred<void>();
  const native = deferred<ExtractResult>();
  const recognizing = {
    status: 'recognizing',
    kind: 'pdf',
    completedPages: 1,
    totalPages: 2,
  } as const;
  jest.mocked(extractPdfText).mockImplementationOnce((_uri, _options, control) => {
    control!.onProgress!({ requestId: 'first', phase: 'ocr', completedPages: 1, totalPages: 2 });
    started.resolve();
    return native.promise;
  });
  const states = jest.fn();
  const stop = observeFileOcr(ID, states);
  configureFileOcrLanguage(() => 'en-US');
  const first = readPdfText(source, signal());
  await started.promise;
  const controller = new AbortController();
  let queued: Promise<ExtractResult>;
  try {
    configureFileOcrLanguage(() => 'de-DE');
    queued = readPdfText(source, controller.signal);
  } finally {
    configureFileOcrLanguage(() => 'en-US');
  }
  await new Promise(setImmediate);
  expect(states).toHaveBeenLastCalledWith(recognizing);
  const stopped = expect(queued).rejects.toThrow('stopped');
  controller.abort(new Error('stopped'));
  await stopped;
  expect(states).toHaveBeenLastCalledWith(recognizing);

  native.resolve(result);
  await first;
  expect(states).toHaveBeenLastCalledWith(undefined);
  expect(extractPdfText).toHaveBeenCalledTimes(1);
  stop();
});

test('a text PDF stops reporting a queue once extraction starts, without reporting OCR', async () => {
  const firstStarted = deferred<void>();
  const textStarted = deferred<void>();
  const firstNative = deferred<ExtractResult>();
  const textNative = deferred<ExtractResult>();
  jest
    .mocked(extractPdfText)
    .mockImplementationOnce(() => {
      firstStarted.resolve();
      return firstNative.promise;
    })
    .mockImplementationOnce(() => {
      textStarted.resolve();
      return textNative.promise;
    });
  const first = readPdfText(source, signal());
  await firstStarted.promise;
  const states = jest.fn();
  const stop = observeFileOcr(OTHER_ID, states);
  const text = readPdfText(managed(OTHER_ID), signal());
  await new Promise(setImmediate);
  expect(states).toHaveBeenLastCalledWith({ status: 'queued' });

  firstNative.resolve(result);
  await textStarted.promise;
  expect(states).toHaveBeenLastCalledWith(undefined);
  textNative.resolve(result);
  await Promise.all([first, text]);
  expect(states.mock.calls).toEqual([[undefined], [{ status: 'queued' }], [undefined]]);
  stop();
});

test('keeps the body with unrecognized pages, and clears file activity on engine failure', async () => {
  jest.mocked(extractPdfText).mockResolvedValueOnce({ ...result, unrecognizedPages: [1] });
  await expect(readPdfText(source, signal())).resolves.toMatchObject({
    text: result.text,
    unrecognizedPages: [1],
  });
  const states = jest.fn();
  const stop = observeFileOcr(ID, states);
  jest.mocked(extractPdfText).mockImplementationOnce(async (_uri, _options, control) => {
    control!.onProgress!({ requestId: 'request', completedPages: 0, totalPages: 1, phase: 'ocr' });
    throw new Error('engine failed');
  });
  await expect(readPdfText(source, signal())).rejects.toThrow('engine failed');
  expect(states).toHaveBeenLastCalledWith(undefined);
  stop();
});

test('task caches separate page selections, field definitions and questions', async () => {
  const disk = new Map<string, ExtractResult>();
  jest.mocked(readFileTextCache).mockImplementation(async (file) => disk.get(file.uri));
  jest.mocked(writeFileTextCache).mockImplementation((file, value) => {
    disk.set(file.uri, value);
  });
  const extract = jest.fn<
    ReturnType<FileTextEngine['extract']>,
    Parameters<FileTextEngine['extract']>
  >(async () => result);
  configureFileOcrEngine(async () => ({ cacheKey: 'model-v1', extract }));
  const requests = [
    { task: 'tables' as const, pages: [1] },
    { task: 'tables' as const, pages: [2] },
    { task: 'fields' as const, fields: ['invoice'] },
    { task: 'fields' as const, fields: ['amount'] },
    { task: 'question' as const, question: 'Invoice number?' },
    { task: 'question' as const, question: 'Total?' },
  ];
  for (const options of requests) await readDocumentPages(source, 'pdf', options, signal());
  await readDocumentPages(source, 'pdf', requests[0]!, signal());
  expect(disk.size).toBe(requests.length);
  expect(extract).toHaveBeenCalledTimes(requests.length);
});

test('embedded image cancellation keeps its temporary source until native extraction settles', async () => {
  const started = deferred<AbortSignal>();
  const native = deferred<ExtractResult>();
  configureFileOcrEngine(async () => ({
    cacheKey: 'model-v1',
    extract: (_uri, _kind, signal) => {
      started.resolve(signal);
      return native.promise;
    },
  }));
  const dispose = jest.fn();
  const controller = new AbortController();
  const reading = readDocumentPages(
    source,
    'image',
    { task: 'document', assetRef: 'image.png' },
    controller.signal,
    { cacheSource: source, cacheKey: 'asset-digest', dispose },
  );
  const aborted = expect(reading).rejects.toThrow('cancel asset');
  const nativeSignal = await started.promise;
  controller.abort(new Error('cancel asset'));
  await aborted;
  expect(nativeSignal.aborted).toBe(true);
  expect(dispose).not.toHaveBeenCalled();
  native.resolve(result);
  await new Promise(setImmediate);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(writeFileTextCache).not.toHaveBeenCalled();
});

test('structural tasks never silently fall back to plain system text', async () => {
  await expect(
    readDocumentPages(source, 'pdf', { task: 'tables' }, signal()),
  ).rejects.toMatchObject({ code: 'model-unavailable' });
  expect(extractPdfText).not.toHaveBeenCalled();
});
