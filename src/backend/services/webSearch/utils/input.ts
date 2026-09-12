import { isValidUrl } from './url';

export const MAX_WEB_SEARCH_INPUTS = 20;

export function normalizeWebSearchKeywords(keywords: string[]): string[] {
  const normalized = keywords.flatMap((keyword) => keyword.trim() || []);

  if (normalized.length === 0) {
    throw new Error('At least one web search keyword is required');
  }

  if (normalized.length > MAX_WEB_SEARCH_INPUTS) {
    throw new Error(`Web search supports at most ${MAX_WEB_SEARCH_INPUTS} inputs per request`);
  }

  return normalized;
}

export function normalizeWebSearchUrls(urls: string[]): string[] {
  const normalized = urls.flatMap((url) => url.trim() || []);

  if (normalized.length === 0) {
    throw new Error('At least one URL is required');
  }

  if (normalized.length > MAX_WEB_SEARCH_INPUTS) {
    throw new Error(`Web search supports at most ${MAX_WEB_SEARCH_INPUTS} inputs per request`);
  }

  const invalidUrls = normalized.filter((url) => !isValidUrl(url));
  if (invalidUrls.length > 0) {
    throw new Error(`Invalid URL format: ${invalidUrls.join(', ')}`);
  }

  return normalized;
}
