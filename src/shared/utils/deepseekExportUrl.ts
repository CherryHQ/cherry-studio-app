import { DeepseekImportError } from '@/shared/contracts/deepseekImport';

/** The verified DeepSeek export bucket; other Huawei Cloud buckets are not trusted exports. */
const DEEPSEEK_EXPORT_HOST = 'deepseek-chat-history-exports-prod.obs.cn-east-3.myhuaweicloud.com';

export function parseDeepseekExportUrl(input: string, now = Date.now()): string {
  const original = input.trim();
  let url: URL;
  try {
    url = new URL(original);
  } catch {
    throw new DeepseekImportError('invalid-link');
  }
  const query = url.searchParams;
  const required = ['response-content-disposition', 'Expires', 'AccessKeyId', 'Signature'];
  if (
    original.length > 8192 ||
    url.protocol !== 'https:' ||
    url.hostname !== DEEPSEEK_EXPORT_HOST ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !/^\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.zip$/i.test(url.pathname) ||
    required.some((key) => query.getAll(key).length !== 1 || !query.get(key)) ||
    !/^attachment;\s*filename="?deepseek_data-\d{4}-\d{2}-\d{2}\.zip"?$/.test(
      query.get('response-content-disposition') ?? '',
    ) ||
    !/^\d+$/.test(query.get('Expires') ?? '') ||
    !/^[a-zA-Z0-9]+$/.test(query.get('AccessKeyId') ?? '') ||
    !/^[a-zA-Z0-9+/=]+$/.test(query.get('Signature') ?? '')
  )
    throw new DeepseekImportError('invalid-link');
  const expires = Number(query.get('Expires')) * 1000;
  if (!Number.isSafeInteger(expires)) throw new DeepseekImportError('invalid-link');
  if (expires <= now) throw new DeepseekImportError('expired-link');
  // Do not reserialize a signed query: keep its original ordering and percent encoding.
  return original;
}
