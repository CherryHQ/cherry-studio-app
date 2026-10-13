import { createHttpClient, HttpError } from '@/backend/services/http';

const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTML_TYPES = new Set(['text/html', 'application/xhtml+xml']);
const TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown']);

function invalidPage(message: string, code: string): HttpError {
  return new HttpError(message, { code, kind: 'invalid_response' });
}

function parsePageUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw invalidPage('The page URL is invalid.', 'page_invalid_url');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !hostname.includes('.') ||
    /^[\d.]+$/.test(hostname) ||
    hostname.includes(':') ||
    /(?:^|\.)(?:localhost|local|internal)$/.test(hostname)
  ) {
    throw invalidPage(
      'Local extraction requires a public HTTP(S) hostname without URL credentials.',
      'page_unsupported_url',
    );
  }
  url.hash = '';
  return url;
}

function assertUtf8(charset: string | undefined): void {
  if (charset && !/^(?:utf-?8|us-ascii|ascii)$/i.test(charset)) {
    throw invalidPage('Local extraction currently supports UTF-8 pages only.', 'page_charset');
  }
}

export async function downloadWebPage(input: string, signal: AbortSignal) {
  let target = parsePageUrl(input);
  const startedAt = Date.now();
  for (let redirects = 0; ; redirects++) {
    signal.throwIfAborted();
    const timeoutMs = DOWNLOAD_TIMEOUT_MS - (Date.now() - startedAt);
    if (timeoutMs <= 0) {
      throw new HttpError('Page download timed out.', { kind: 'timeout', code: 'page_timeout' });
    }
    const client = createHttpClient({ baseUrl: target.origin, statusPolicy: 'all' });
    const response = await client.request<ArrayBuffer>({
      method: 'GET',
      // Preserve signed/duplicate query parameters exactly as normalized by URL.
      path: target.pathname + target.search,
      headers: { Accept: 'text/html, application/xhtml+xml, text/plain, text/markdown' },
      credentials: 'omit',
      redirect: 'manual',
      responseType: 'arraybuffer',
      maxResponseBytes: MAX_PAGE_BYTES,
      signal,
      timeoutMs,
    });
    signal.throwIfAborted();
    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirects >= MAX_REDIRECTS) {
        throw invalidPage('The page exceeded the redirect limit.', 'page_redirect_limit');
      }
      const location = response.headers.location;
      if (!location) throw invalidPage('The redirect has no destination.', 'page_redirect_missing');
      try {
        target = parsePageUrl(new URL(location, target.href).href);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw invalidPage('The redirect destination is invalid.', 'page_redirect_invalid');
      }
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new HttpError(`Page download failed with HTTP ${response.status}.`, {
        kind: 'http',
        status: response.status,
        code: 'page_http_error',
      });
    }
    const contentType = response.headers['content-type'] ?? '';
    const mimeType = contentType.split(';')[0].trim().toLowerCase();
    if (!HTML_TYPES.has(mimeType) && !TEXT_TYPES.has(mimeType)) {
      throw invalidPage(
        'The URL did not return a supported HTML or text page.',
        'page_content_type',
      );
    }
    const headerCharset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType)?.[1];
    assertUtf8(headerCharset);
    if (!(response.data instanceof ArrayBuffer) || response.data.byteLength > MAX_PAGE_BYTES) {
      throw invalidPage('The downloaded page is invalid or too large.', 'page_invalid_body');
    }
    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(response.data);
    } catch {
      throw invalidPage('The downloaded page is not valid UTF-8.', 'page_charset');
    }
    if (!content.trim()) throw invalidPage('The downloaded page is empty.', 'page_empty');
    const isHtml = HTML_TYPES.has(mimeType);
    if (isHtml && !headerCharset) {
      const metaTags = content.slice(0, 4096).match(/<meta\b[^>]*>/gi) ?? [];
      const declaredCharset = metaTags
        .map((tag) => /charset\s*=\s*["']?([^\s;"'>/]+)/i.exec(tag)?.[1])
        .find(Boolean);
      assertUtf8(declaredCharset);
    }
    return { content, isHtml, url: target.href };
  }
}
