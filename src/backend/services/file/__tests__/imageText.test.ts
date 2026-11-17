import { readDeepseekOcr } from '../deepseekOcr';
import { getFileOcrEngine, readImageText } from '../fileTextExtraction';
import { readImageUriText } from '../imageText';

const mockFile = { size: 12, exists: true };
jest.mock('expo-file-system', () => ({ File: jest.fn(() => mockFile) }));
jest.mock('../fileTextExtraction', () => ({
  getFileOcrEngine: jest.fn(() => 'local'),
  readImageText: jest.fn(),
}));
jest.mock('../deepseekOcr', () => ({ readDeepseekOcr: jest.fn() }));
const result = {
  text: '  Receipt 🍒  ',
  totalPages: 1,
  extractedPages: 1,
  isTruncated: false,
  extractionError: false,
  ocrError: false,
  ocrUnavailable: false,
  unrecognizedPages: [],
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getFileOcrEngine).mockReturnValue('local');
  mockFile.exists = true;
  mockFile.size = 12;
  jest.mocked(readImageText).mockResolvedValue(result);
});

test('uses the selected OCR engine and preserves cloud failure without a local retry', async () => {
  jest.mocked(getFileOcrEngine).mockReturnValue('deepseek');
  jest.mocked(readDeepseekOcr).mockResolvedValueOnce(result);
  const read = () => readImageUriText('file:///receipt.png', new AbortController().signal);
  await expect(read()).resolves.toEqual({
    text: 'Receipt 🍒',
    truncated: false,
    parser: 'deepseek-ocr',
  });
  jest.mocked(readDeepseekOcr).mockRejectedValueOnce(new Error('cloud unavailable'));
  await expect(read()).rejects.toMatchObject({ failure: 'failed' });
  expect(readImageText).not.toHaveBeenCalled();
});

test('returns recognized text and rejects unreadable, unsupported and failed images distinctly', async () => {
  const read = () => readImageUriText('file:///receipt.png', new AbortController().signal);
  await expect(read()).resolves.toEqual({ text: 'Receipt 🍒', truncated: false });
  jest.mocked(readImageText).mockResolvedValueOnce({ ...result, text: '  ' });
  await expect(read()).rejects.toMatchObject({ failure: 'empty' });
  jest.mocked(readImageText).mockResolvedValueOnce({ ...result, ocrUnavailable: true });
  await expect(read()).rejects.toMatchObject({ failure: 'unsupported' });
  jest.mocked(readImageText).mockRejectedValueOnce(new Error('native decode failed'));
  await expect(read()).rejects.toMatchObject({ failure: 'failed' });
});

test('rejects unavailable and oversized images before cache access', async () => {
  mockFile.exists = false;
  await expect(
    readImageUriText('file:///receipt.png', new AbortController().signal),
  ).rejects.toMatchObject({ failure: 'unavailable' });
  mockFile.exists = true;
  mockFile.size = 30 * 1024 * 1024 + 1;
  await expect(
    readImageUriText('file:///receipt.png', new AbortController().signal),
  ).rejects.toMatchObject({ failure: 'file-bytes' });
  expect(readImageText).not.toHaveBeenCalled();
});

test('preserves cancellation instead of reporting recognition failure', async () => {
  const controller = new AbortController();
  jest.mocked(readImageText).mockImplementationOnce(async () => {
    controller.abort(new Error('stopped'));
    return result;
  });
  await expect(readImageUriText('file:///receipt.png', controller.signal)).rejects.toThrow(
    'stopped',
  );
});
