import { DeepseekImportError } from '@/shared/contracts/deepseekImport';

/**
 * Admits any HTTPS link whose host names DeepSeek, so export storage can move between buckets,
 * regions or providers. The archive is untrusted either way and is validated after download.
 */
export function parseDeepseekExportUrl(input: string, now = Date.now()): string {
  const original = input.trim();
  let url: URL;
  try {
    url = new URL(original);
  } catch {
    throw new DeepseekImportError('invalid-link');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !url.hostname.toLowerCase().includes('deepseek')
  )
    throw new DeepseekImportError('invalid-link');
  // Signed object-storage links carry their expiry in seconds; report it before downloading.
  const expires = url.searchParams.get('Expires');
  if (expires && /^\d{1,12}$/.test(expires) && Number(expires) * 1000 <= now)
    throw new DeepseekImportError('expired-link');
  // Do not reserialize a signed query: keep its original ordering and percent encoding.
  return original;
}
