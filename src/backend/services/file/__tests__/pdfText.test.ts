import { File } from 'expo-file-system';

import { extractPdfText, type ExtractResult } from '../../../../../modules/pdf-text-extractor';
import { configurePdfOcrLanguage, observePdfOcr, readPdfText } from '../pdfText';
import { readPdfTextCache, writePdfTextCache } from '../pdfTextCache';

jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('../../../../../modules/pdf-text-extractor', () => ({ extractPdfText: jest.fn() }));
jest.mock('../pdfTextCache', () => ({
  pdfTextCacheFile: (source: File, language: string) => ({
    uri: `${source.uri}.${language}.cache`,
  }),
  readPdfTextCache: jest.fn(),
  writePdfTextCache: jest.fn(),
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
  jest.mocked(readPdfTextCache).mockResolvedValue(undefined);
  jest.mocked(extractPdfText).mockResolvedValue(result);
});

test('later turns and tool reads reuse persisted text without starting OCR', async () => {
  const disk = new Map<string, ExtractResult>();
  jest.mocked(readPdfTextCache).mockImplementation(async (file) => disk.get(file.uri));
  jest.mocked(writePdfTextCache).mockImplementation((file, value) => {
    disk.set(file.uri, value);
  });
  await expect(readPdfText(source, signal())).resolves.toEqual(result);
  await expect(readPdfText(source, signal())).resolves.toEqual(result);
  expect(extractPdfText).toHaveBeenCalledTimes(1);
});

test('history re-reads of cached results show no recognition activity on the file', async () => {
  const states = jest.fn();
  const stop = observePdfOcr(ID, states);
  jest.mocked(readPdfTextCache).mockResolvedValueOnce({ ...result, unrecognizedPages: [2] });
  await expect(readPdfText(source, signal())).resolves.toMatchObject({ unrecognizedPages: [2] });
  expect(extractPdfText).not.toHaveBeenCalled();
  expect(states.mock.calls).toEqual([[undefined]]);
  stop();
});

test('recognizes in the resolved app language and keys results by it', async () => {
  configurePdfOcrLanguage(() => 'ru-RU');
  try {
    await readPdfText(source, signal());
    expect(extractPdfText).toHaveBeenCalledWith(
      source.uri,
      expect.objectContaining({ language: 'ru-RU' }),
      expect.anything(),
    );
    expect(writePdfTextCache).toHaveBeenCalledWith({ uri: `${source.uri}.ru-RU.cache` }, result);
  } finally {
    configurePdfOcrLanguage(() => 'en-US');
  }
});

test('a shared extraction survives one caller cancelling and reports its file once', async () => {
  const started = deferred<AbortSignal>();
  const native = deferred<ExtractResult>();
  const states = jest.fn();
  const others = jest.fn();
  const stop = observePdfOcr(ID, states);
  const stopOthers = observePdfOcr(OTHER_ID, others);
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
    [{ status: 'recognizing', completedPages: 0, totalPages: 2 }],
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
  expect(writePdfTextCache).toHaveBeenCalledTimes(1);
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
  const stop = observePdfOcr(OTHER_ID, states);
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
  const stop = observePdfOcr(ID, states);
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
  const stopResumed = observePdfOcr(ID, resumedObserver);
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
  const recognizing = { status: 'recognizing', completedPages: 1, totalPages: 2 } as const;
  jest.mocked(extractPdfText).mockImplementationOnce((_uri, _options, control) => {
    control!.onProgress!({ requestId: 'first', phase: 'ocr', completedPages: 1, totalPages: 2 });
    started.resolve();
    return native.promise;
  });
  const states = jest.fn();
  const stop = observePdfOcr(ID, states);
  configurePdfOcrLanguage(() => 'en-US');
  const first = readPdfText(source, signal());
  await started.promise;
  const controller = new AbortController();
  let queued: Promise<ExtractResult>;
  try {
    configurePdfOcrLanguage(() => 'de-DE');
    queued = readPdfText(source, controller.signal);
  } finally {
    configurePdfOcrLanguage(() => 'en-US');
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
  const stop = observePdfOcr(OTHER_ID, states);
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
  const stop = observePdfOcr(ID, states);
  jest.mocked(extractPdfText).mockImplementationOnce(async (_uri, _options, control) => {
    control!.onProgress!({ requestId: 'request', completedPages: 0, totalPages: 1, phase: 'ocr' });
    throw new Error('engine failed');
  });
  await expect(readPdfText(source, signal())).rejects.toThrow('engine failed');
  expect(states).toHaveBeenLastCalledWith(undefined);
  stop();
});
