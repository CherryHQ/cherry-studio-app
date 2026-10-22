import { requireOptionalNativeModule } from 'expo';

import { extractPdfText } from '../../index';
import type { ExtractionProgress, ExtractResult } from '../PdfTextExtractor.types';

jest.mock('expo', () => {
  const native = {
    createRequest: jest.fn(),
    cancelRequest: jest.fn(),
    extractText: jest.fn(),
    addListener: jest.fn(),
  };
  return { requireOptionalNativeModule: jest.fn(() => native) };
});
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const native = jest.mocked(requireOptionalNativeModule).mock.results[0].value as {
  createRequest: jest.Mock;
  cancelRequest: jest.Mock;
  extractText: jest.Mock;
  addListener: jest.Mock;
};
const result: ExtractResult = {
  text: 'Native page\n\n扫描文字',
  totalPages: 2,
  extractedPages: 2,
  isTruncated: false,
  extractionError: false,
  ocrError: false,
  unrecognizedPages: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  native.createRequest.mockReturnValue('request');
});

test('an already cancelled request never reserves native work', async () => {
  const controller = new AbortController();
  controller.abort(new Error('stopped'));
  await expect(extractPdfText('/scan.pdf', {}, { signal: controller.signal })).rejects.toThrow(
    'stopped',
  );
  expect(native.createRequest).not.toHaveBeenCalled();
});

test('routes progress by request and removes the listener when extraction finishes', async () => {
  let listener!: (progress: ExtractionProgress) => void;
  const remove = jest.fn();
  native.addListener.mockImplementation((_name, receive) => {
    listener = receive;
    return { remove };
  });
  native.extractText.mockImplementation(async () => {
    listener({ requestId: 'other', completedPages: 0, totalPages: 2, phase: 'ocr' });
    listener({ requestId: 'request', completedPages: 1, totalPages: 2, phase: 'ocr' });
    return result;
  });
  const onProgress = jest.fn();
  await expect(extractPdfText('/scan.pdf', {}, { onProgress })).resolves.toEqual(result);
  expect(onProgress).toHaveBeenCalledTimes(1);
  expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request' }));
  expect(remove).toHaveBeenCalledTimes(1);
  listener({ requestId: 'request', completedPages: 2, totalPages: 2, phase: 'ocr' });
  expect(onProgress).toHaveBeenCalledTimes(1);
});

test('cancellation reaches a queued native request and discards its late result', async () => {
  let finish!: (value: ExtractResult) => void;
  native.extractText.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const extraction = extractPdfText('/scan.pdf', {}, { signal: controller.signal });
  const rejected = expect(extraction).rejects.toThrow('stopped');
  controller.abort(new Error('stopped'));
  expect(native.cancelRequest).toHaveBeenCalledWith('request');
  finish(result);
  await rejected;
});

test('a failed native request removes its abort listener and progress subscription', async () => {
  const remove = jest.fn();
  native.addListener.mockReturnValue({ remove });
  native.extractText.mockRejectedValueOnce(new Error('recognition failed'));
  const controller = new AbortController();
  await expect(
    extractPdfText('/scan.pdf', {}, { signal: controller.signal, onProgress: jest.fn() }),
  ).rejects.toThrow('recognition failed');
  const cancellationCount = native.cancelRequest.mock.calls.length;
  controller.abort();
  expect(native.cancelRequest).toHaveBeenCalledTimes(cancellationCount);
  expect(remove).toHaveBeenCalledTimes(1);
});
