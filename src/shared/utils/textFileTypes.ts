import { FALLBACK_MEDIA_TYPE, filenameExtension } from '@/shared/data/types/file';

const JSON_EXTENSIONS = new Set(['json', 'jsonc', 'jsonl', 'ndjson']);
const JAVASCRIPT_EXTENSIONS = new Set(['cjs', 'js', 'jsx', 'mjs']);
const TYPESCRIPT_EXTENSIONS = new Set(['cts', 'mts', 'ts', 'tsx']);

/** Explicit application/* types whose stored filename must also match the listed extensions. */
export const APPLICATION_TEXT_ATTACHMENT_EXTENSIONS: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map([
  ['application/javascript', JAVASCRIPT_EXTENSIONS],
  ['application/json', JSON_EXTENSIONS],
  ['application/ld+json', JSON_EXTENSIONS],
  ['application/manifest+json', JSON_EXTENSIONS],
  ['application/sql', new Set(['sql'])],
  ['application/toml', new Set(['toml'])],
  ['application/typescript', TYPESCRIPT_EXTENSIONS],
  ['application/x-httpd-php', new Set(['php'])],
  ['application/x-javascript', JAVASCRIPT_EXTENSIONS],
  ['application/x-ndjson', new Set(['jsonl', 'ndjson'])],
  ['application/x-sh', new Set(['bash', 'sh', 'zsh'])],
  ['application/x-shellscript', new Set(['bash', 'sh', 'zsh'])],
  ['application/x-typescript', TYPESCRIPT_EXTENSIONS],
  ['application/x-yaml', new Set(['yaml', 'yml'])],
  ['application/xhtml+xml', new Set(['html', 'xhtml'])],
  ['application/xml', new Set(['xml', 'xsl', 'xslt'])],
  ['application/yaml', new Set(['yaml', 'yml'])],
]);

export function isSupportedTextAttachment(file: { mediaType: string; name: string }) {
  const mediaType = normalizeMediaType(file.mediaType);
  if (mediaType.startsWith('text/')) {
    return true;
  }

  const extension = filenameExtension(file.name);
  if (!extension) {
    return false;
  }
  const allowedExtensions =
    APPLICATION_TEXT_ATTACHMENT_EXTENSIONS.get(mediaType) ??
    (mediaType.startsWith('application/') && mediaType.endsWith('+json')
      ? JSON_EXTENSIONS
      : undefined);
  return allowedExtensions?.has(extension) ?? false;
}

function normalizeMediaType(mediaType: string): string {
  return mediaType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

/** Infer only while importing; stored specific MIME types remain authoritative. */
export function resolveTextImportMediaType(name: string, mediaType?: string): string {
  if (mediaType && mediaType.toLowerCase() !== FALLBACK_MEDIA_TYPE) return mediaType;
  const extension = filenameExtension(name);
  if (extension && TEXT_EXTENSIONS.has(extension)) return 'text/plain';
  return mediaType ?? FALLBACK_MEDIA_TYPE;
}

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'log',
  'ini',
  'conf',
  'cfg',
  'css',
  'scss',
  'sass',
  'less',
  'vue',
  'svelte',
  'py',
  'rb',
  'rs',
  'go',
  'java',
  'kt',
  'kts',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'cs',
  'swift',
  'dart',
  'r',
  'tex',
  ...[...APPLICATION_TEXT_ATTACHMENT_EXTENSIONS.values()].flatMap((values) => [...values]),
]);
