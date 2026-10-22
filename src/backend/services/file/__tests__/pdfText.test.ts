import { File } from 'expo-file-system';

import { extractPdfText, type ExtractResult } from '../../../../../modules/pdf-text-extractor';
import { readPdfText, subscribePdfOcr } from '../pdfText';
import { readPdfTextCache, writePdfTextCache } from '../pdfTextCache';

jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('../../../../../modules/pdf-text-extractor', () => ({ extractPdfText: jest.fn() }));
jest.mock('../pdfTextCache', () => ({
  pdfTextCacheFile: (source: File) => ({ uri: source.uri + '.cache' }),
  readPdfTextCache: jest.fn(),
  writePdfTextCache: jest.fn(),
}));
const source = { uri: 'file:///managed/document.pdf', exists: true } as File;
const result: ExtractResult = {
  text: '扫描文字',
  totalPages: 2,
  extractedPages: 2,
  isTruncated: false,
  extractionError: false,
  ocrError: false,
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

test('cached partial results still disclose unrecognized pages without recognition activity', async () => {
  const events = jest.fn();
  const unsubscribe = subscribePdfOcr(events);
  jest.mocked(readPdfTextCache).mockResolvedValueOnce({ ...result, unrecognizedPages: [2] });
  await readPdfText(source, signal());
  expect(extractPdfText).not.toHaveBeenCalled();
  expect(events.mock.calls.map(([event]) => event)).toEqual([
    { type: 'progress', progress: null },
    { type: 'unrecognized', pages: [2] },
  ]);
  unsubscribe();
});

test('a shared extraction survives one caller cancelling and publishes progress once', async () => {
  const started = deferred<AbortSignal>();
  const native = deferred<ExtractResult>();
  const events = jest.fn();
  const unsubscribe = subscribePdfOcr(events);
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
  expect(events.mock.calls.map(([event]) => event)).toEqual([
    { type: 'progress', progress: null },
    { type: 'progress', progress: { completedPages: 0, totalPages: 2 } },
    { type: 'progress', progress: null },
  ]);
  unsubscribe();
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
  const controller = new AbortController();
  const queued = readPdfText(
    { ...source, uri: 'file:///managed/other.pdf' } as File,
    controller.signal,
  );
  const stopped = expect(queued).rejects.toThrow('stopped');
  controller.abort(new Error('stopped'));
  await stopped;
  native.resolve(result);
  await first;
  expect(extractPdfText).toHaveBeenCalledTimes(1);
});

test('reports empty OCR pages without losing the body, and clears activity on engine failure', async () => {
  const events = jest.fn();
  const unsubscribe = subscribePdfOcr(events);
  jest.mocked(extractPdfText).mockResolvedValueOnce({ ...result, unrecognizedPages: [1] });
  await expect(readPdfText(source, signal())).resolves.toMatchObject({
    text: result.text,
    unrecognizedPages: [1],
  });
  expect(events).toHaveBeenCalledWith({ type: 'unrecognized', pages: [1] });
  jest.mocked(extractPdfText).mockRejectedValueOnce(new Error('engine failed'));
  await expect(readPdfText(source, signal())).rejects.toThrow('engine failed');
  expect(events).toHaveBeenLastCalledWith({ type: 'progress', progress: null });
  unsubscribe();
});
