import { TextDecoder, TextEncoder } from 'node:util';

import { createHttpClient, type HttpRequest } from '@/backend/services/http';

import { downloadWebPage } from '../downloadWebPage';

jest.mock('@/backend/services/http', () => ({
  ...jest.requireActual('@/backend/services/http'),
  createHttpClient: jest.fn(),
}));

const request = jest.fn();
const originalDecoder = globalThis.TextDecoder;

beforeEach(() => {
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
  request.mockReset();
  jest.mocked(createHttpClient).mockReturnValue({ request });
});
afterEach(() => {
  globalThis.TextDecoder = originalDecoder;
});

function page(content: string, type = 'text/html; charset=utf-8') {
  return {
    status: 200,
    headers: { 'content-type': type },
    data: new TextEncoder().encode(content).buffer,
  };
}

test('follows relative redirects and preserves the final URL and query', async () => {
  request.mockResolvedValueOnce({
    status: 302,
    headers: { location: '/article?a=1&a=2' },
    data: new ArrayBuffer(0),
  });
  request.mockResolvedValueOnce(page('<html><body>Content</body></html>'));
  const signal = new AbortController().signal;
  await expect(downloadWebPage('https://example.com/start#section', signal)).resolves.toMatchObject(
    {
      url: 'https://example.com/article?a=1&a=2',
      isHtml: true,
    },
  );
  expect(request.mock.calls[1][0]).toMatchObject({
    path: '/article?a=1&a=2',
    credentials: 'omit',
    redirect: 'manual',
    maxResponseBytes: 1024 * 1024,
    responseType: 'arraybuffer',
    signal,
  });
});

test.each([
  'http://127.0.0.1/',
  'https://localhost/',
  'https://device.local/',
  'file:///tmp/page',
  'https://user:secret@example.com/',
])('rejects unsupported targets before any request: %s', async (url) => {
  await expect(downloadWebPage(url, new AbortController().signal)).rejects.toMatchObject({
    code: 'page_unsupported_url',
  });
  expect(request).not.toHaveBeenCalled();
});

test('validates every redirect destination', async () => {
  request.mockResolvedValue({
    status: 302,
    headers: { location: 'http://127.0.0.1/private' },
    data: new ArrayBuffer(0),
  });
  await expect(
    downloadWebPage('https://example.com/', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'page_unsupported_url' });
  expect(request).toHaveBeenCalledTimes(1);
});

test('bounds redirect loops', async () => {
  request.mockResolvedValue({
    status: 302,
    headers: { location: '/again' },
    data: new ArrayBuffer(0),
  });
  await expect(
    downloadWebPage('https://example.com/', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'page_redirect_limit' });
  expect(request).toHaveBeenCalledTimes(6);
});

test.each([
  ['%PDF', 'application/pdf', 'page_content_type'],
  ['content', 'text/html; charset=gbk', 'page_charset'],
  ['<html><head><meta charset="gbk"></head></html>', 'text/html', 'page_charset'],
  [' ', 'text/plain', 'page_empty'],
])('reports unsupported or unusable documents', async (content, type, code) => {
  request.mockResolvedValue(page(content, type));
  await expect(
    downloadWebPage('https://example.com/', new AbortController().signal),
  ).rejects.toMatchObject({ code });
});

test('preserves HTTP errors without parsing their bodies as articles', async () => {
  request.mockResolvedValue({ ...page('<h1>Forbidden</h1>'), status: 403 });
  await expect(
    downloadWebPage('https://example.com/', new AbortController().signal),
  ).rejects.toMatchObject({ kind: 'http', status: 403 });
});

test('cancellation between redirects prevents another download', async () => {
  const controller = new AbortController();
  const reason = new Error('cancelled');
  request.mockImplementation(async (_input: HttpRequest) => {
    controller.abort(reason);
    return { status: 302, headers: { location: '/next' }, data: new ArrayBuffer(0) };
  });
  await expect(downloadWebPage('https://example.com/', controller.signal)).rejects.toBe(reason);
  expect(request).toHaveBeenCalledTimes(1);
});
