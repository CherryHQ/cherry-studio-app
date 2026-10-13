import { createJsSandbox, type JsSandbox } from '@/backend/services/jsSandbox';

import { createExtractionCode } from '../createExtractionCode';
import { extractPage } from '../extractPage';

jest.mock('@/backend/services/jsSandbox', () => ({ createJsSandbox: jest.fn() }));
jest.mock('../createExtractionCode', () => ({
  MAX_EXTRACTED_CONTENT_CHARACTERS: 24_000,
  createExtractionCode: jest.fn(),
}));

const run = jest.fn() as jest.MockedFunction<JsSandbox['run']>;
const output = { durationMs: 1, logs: '', logsTruncated: false };

beforeEach(() => {
  run.mockReset();
  jest.mocked(createJsSandbox).mockReturnValue({ run });
  jest.mocked(createExtractionCode).mockReset().mockReturnValue('shipped parser');
});

function input() {
  return {
    html: '<html></html>',
    url: 'https://example.com/',
    signal: new AbortController().signal,
    onSettled: jest.fn(),
  };
}

test('rejects native truncation even if the remaining JSON looks valid', async () => {
  run.mockResolvedValue({
    status: 'ok',
    result: JSON.stringify({ status: 'ok', title: 'Page', content: 'Content', truncated: false }),
    resultTruncated: true,
    ...output,
  });
  await expect(extractPage(input())).rejects.toMatchObject({ code: 'extraction_incomplete' });
});

test.each(['memory', 'timeout'] as const)('preserves extraction failure code: %s', async (kind) => {
  run.mockResolvedValue({ status: 'error', kind, message: 'budget exhausted', ...output });
  await expect(extractPage(input())).rejects.toMatchObject({
    code: `extraction_${kind}`,
    kind: kind === 'timeout' ? 'timeout' : 'invalid_response',
  });
});

test('rejects invalid JSON and empty extraction separately', async () => {
  run.mockResolvedValueOnce({ status: 'ok', result: '{', ...output });
  await expect(extractPage(input())).rejects.toMatchObject({ code: 'extraction_invalid_result' });
  run.mockResolvedValueOnce({ status: 'ok', result: '{"status":"empty"}', ...output });
  await expect(extractPage(input())).rejects.toMatchObject({ code: 'extraction_empty' });
});

test('releases the page lease when the client has no native sandbox', async () => {
  jest.mocked(createJsSandbox).mockReturnValue(null);
  const request = input();
  await expect(extractPage(request)).rejects.toMatchObject({
    code: 'provider_unsupported_on_platform',
  });
  expect(request.onSettled).toHaveBeenCalledTimes(1);
  expect(run).not.toHaveBeenCalled();
});

test('releases the page lease if parser setup fails before native submission', async () => {
  jest.mocked(createExtractionCode).mockImplementation(() => {
    throw new Error('invalid asset');
  });
  const request = input();
  await expect(extractPage(request)).rejects.toThrow('invalid asset');
  expect(request.onSettled).toHaveBeenCalledTimes(1);
  expect(run).not.toHaveBeenCalled();
});
