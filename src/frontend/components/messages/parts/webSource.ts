import type { CherryMessagePart } from '@/shared/data/types/message';

type SourceUrlPart = Extract<CherryMessagePart, { type: 'source-url' }>;

export type WebSource = {
  aliases?: string[];
  content?: string;
  faviconUrl?: string;
  id: number | string;
  publishedDate?: string;
  siteName: string;
  title?: string;
  url: string;
};

export function parseWebSources(output: unknown): WebSource[] {
  return getResultItems(output).flatMap((item, index) => {
    const source = toWebSource(item, index + 1);
    return source ? [source] : [];
  });
}

export function enrichWebSources(
  sources: readonly WebSource[],
  messageParts: readonly CherryMessagePart[],
): WebSource[] {
  const metadataByUrl = collectWebSourceMetadata(messageParts);
  const citationContextById = collectCitationContext(messageParts);
  return sources.map((source) => {
    const metadata = getWebSourceMetadata(metadataByUrl, source);
    const enrichedSource = metadata ? mergeWebSources(source, metadata) : source;
    return withCitationContext(enrichedSource, citationContextById);
  });
}

export function resolveCitationWebSources(messageParts: readonly CherryMessagePart[]): WebSource[] {
  const metadataByUrl = collectWebSourceMetadata(messageParts);
  const citationContextById = collectCitationContext(messageParts);
  const sourceParts: SourceUrlPart[] = [];

  for (const part of messageParts) {
    if (part.type === 'source-url') {
      sourceParts.push(part);
    }
  }

  const sourcesByUrl = new Map<string, WebSource>();

  sourceParts.forEach((part, index) => {
    if (sourcesByUrl.has(part.url)) return;

    const source = toWebSource(part, part.sourceId || index + 1);
    if (!source) return;

    const metadata = getWebSourceMetadata(metadataByUrl, source);
    const titledSource = {
      ...source,
      title: getPageTitle(part.title, part.url) ?? source.title,
    };
    sourcesByUrl.set(
      part.url,
      withCitationContext(
        metadata ? mergeWebSources(titledSource, metadata) : titledSource,
        citationContextById,
      ),
    );
  });

  return [...sourcesByUrl.values()];
}

export function getFaviconUrls(source: WebSource): string[] {
  const urls: string[] = [];
  const parsedUrl = parseHttpUrl(source.url);

  if (source.faviconUrl) {
    urls.push(source.faviconUrl);
  }

  if (parsedUrl) {
    urls.push(new URL('/favicon.ico', parsedUrl.origin).toString());
    urls.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(parsedUrl.hostname)}.ico`);
  }

  return [...new Set(urls)];
}

function toWebSource(value: unknown, fallbackId: number | string): WebSource | null {
  if (!isRecord(value)) return null;

  const url = getFirstString(value, ['url', 'link']);
  const parsedUrl = url ? parseHttpUrl(url) : undefined;
  if (!url || !parsedUrl) return null;

  const title = getPageTitle(getFirstString(value, ['title', 'name', 'headline']), url);
  const siteName = getSiteName(value, parsedUrl.hostname, title);
  const rawContent = getFirstString(value, [
    'content',
    'snippet',
    'description',
    'text',
    'pageContent',
    'summary',
  ]);
  const id = value.id;
  const alias = getHttpUrl(getFirstString(value, ['sourceInput', 'sourceUrl', 'source_url']));

  return {
    ...(alias && alias !== url ? { aliases: [alias] } : {}),
    content: normalizeContent(rawContent, title),
    faviconUrl: getHttpUrl(
      getFirstString(value, ['favicon', 'faviconUrl', 'favicon_url', 'iconUrl', 'icon_url']),
    ),
    id: typeof id === 'string' || typeof id === 'number' ? id : fallbackId,
    publishedDate:
      formatPublishedDate(
        getFirstValue(value, [
          'publishedAt',
          'published_at',
          'publishedDate',
          'published_date',
          'publishedTime',
          'published_time',
          'date',
        ]),
      ) ??
      getPublishedDateFromContent(rawContent) ??
      getPublishedDateFromUrl(url),
    siteName,
    title,
    url,
  };
}

function getResultItems(output: unknown): unknown[] {
  if (Array.isArray(output)) return output;
  if (!isRecord(output)) return [];

  for (const key of ['results', 'sources', 'data', 'items']) {
    const value = output[key];
    if (Array.isArray(value)) return value;
  }

  return getFirstString(output, ['url', 'link']) ? [output] : [];
}

function collectWebSourceMetadata(messageParts: readonly CherryMessagePart[]) {
  const metadataByUrl = new Map<string, WebSource>();

  for (const part of messageParts) {
    if (
      (part.type !== 'dynamic-tool' && !part.type.startsWith('tool-')) ||
      !('state' in part) ||
      part.state !== 'output-available' ||
      !('output' in part)
    ) {
      continue;
    }

    for (const source of parseWebSources(part.output)) {
      for (const key of getWebSourceKeys(source)) {
        const existing = metadataByUrl.get(key);
        metadataByUrl.set(key, existing ? mergeWebSources(existing, source) : source);
      }
    }
  }

  return metadataByUrl;
}

function collectCitationContext(messageParts: readonly CherryMessagePart[]) {
  const contextById = new Map<string, string>();

  for (const part of messageParts) {
    if (part.type !== 'text' || !part.text.includes('[cite:')) continue;

    for (const line of part.text.split(/\r?\n/)) {
      const sourceIds = [...line.matchAll(/\[cite:([\w-]+)\]/g)].map((match) => match[1]);
      if (sourceIds.length === 0) continue;

      const context = normalizeCitationContext(line);
      if (!context) continue;

      for (const sourceId of sourceIds) {
        if (!contextById.has(sourceId)) contextById.set(sourceId, context);
      }
    }
  }

  return contextById;
}

function withCitationContext(source: WebSource, contextById: Map<string, string>): WebSource {
  const context = contextById.get(String(source.id));
  return source.content || !context ? source : { ...source, content: context };
}

function normalizeCitationContext(value: string) {
  const normalized = value
    .replace(/\[cite:[\w-]+\]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:#{1,6}|[-+*]|\d+[.)])\s*/, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return undefined;
  return normalized.length > 300 ? `${normalized.slice(0, 300).trimEnd()}…` : normalized;
}

function mergeWebSources(primary: WebSource, secondary: WebSource): WebSource {
  const primarySiteName = getDefaultSiteName(primary.url);
  const secondaryHasSpecificSiteName = secondary.siteName !== getDefaultSiteName(secondary.url);
  const aliases = [...new Set([...(primary.aliases ?? []), ...(secondary.aliases ?? [])])];

  return {
    ...primary,
    ...(aliases.length > 0 ? { aliases } : {}),
    content: primary.content ?? secondary.content,
    faviconUrl: primary.faviconUrl ?? secondary.faviconUrl,
    publishedDate: primary.publishedDate ?? secondary.publishedDate,
    siteName:
      primary.siteName === primarySiteName && secondaryHasSpecificSiteName
        ? secondary.siteName
        : primary.siteName,
    title: primary.title ?? secondary.title,
  };
}

function getWebSourceMetadata(metadataByUrl: Map<string, WebSource>, source: WebSource) {
  for (const key of getWebSourceKeys(source)) {
    const metadata = metadataByUrl.get(key);
    if (metadata) return metadata;
  }

  return undefined;
}

function getWebSourceKeys(source: WebSource) {
  return [...new Set([source.url, ...(source.aliases ?? [])].map(getWebSourceKey))];
}

function getWebSourceKey(value: string) {
  const url = parseHttpUrl(value);
  if (!url) return value;

  url.hostname = url.hostname.replace(/^www\./, '');
  url.hash = '';
  url.searchParams.sort();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString();
}

function getSiteName(value: Record<string, unknown>, hostname: string, title?: string) {
  const directName = getFirstString(value, [
    'siteName',
    'site_name',
    'sourceName',
    'source_name',
    'publisher',
    'source',
  ]);
  if (directName && !getHttpUrl(directName)) return directName;

  for (const key of ['publisher', 'source']) {
    const nested = value[key];
    if (!isRecord(nested)) continue;

    const nestedName = getFirstString(nested, ['name', 'title']);
    if (nestedName) return nestedName;
  }

  return getSiteNameFromTitle(title) ?? getHostnameSiteName(hostname);
}

function getSiteNameFromTitle(title: string | undefined) {
  if (!title) return undefined;

  const segments = title
    .split(/\s(?:\||-|–|—)\s|_/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const candidate = segments.length > 1 ? segments.at(-1) : undefined;

  return candidate && candidate.length <= 32 && !/[。！？!?]/.test(candidate)
    ? candidate
    : undefined;
}

function getDefaultSiteName(url: string) {
  const parsedUrl = parseHttpUrl(url);
  return parsedUrl ? getHostnameSiteName(parsedUrl.hostname) : '';
}

function getHostnameSiteName(hostname: string) {
  const segments = hostname
    .replace(/^www\./, '')
    .split('.')
    .filter(Boolean);
  const commonSecondLevelDomains = new Set(['co', 'com', 'edu', 'gov', 'net', 'org']);
  const hasCountrySecondLevelDomain =
    segments.length > 2 &&
    segments.at(-1)?.length === 2 &&
    commonSecondLevelDomains.has(segments.at(-2) ?? '');
  const brand = segments.at(hasCountrySecondLevelDomain ? -3 : -2) ?? segments[0] ?? hostname;

  const localizedSiteNames: Record<string, string> = {
    baidu: '百度',
  };
  if (localizedSiteNames[brand]) return localizedSiteNames[brand];

  return brand
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function getPageTitle(value: unknown, url: string) {
  const title = normalizeText(typeof value === 'string' ? value : undefined);
  if (!title || isAddressLike(title, url)) return undefined;
  return title;
}

function isAddressLike(value: string, sourceUrl: string) {
  if (/^https?:\/\//i.test(value) || /^www\./i.test(value)) return true;

  const parsedUrl = parseHttpUrl(sourceUrl);
  if (!parsedUrl) return false;

  const normalizedValue = value.toLowerCase().replace(/\/$/, '');
  const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
  return normalizedValue === hostname;
}

function formatPublishedDate(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;

  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  const numericValue = Number(value);
  const timestamp =
    Number.isFinite(numericValue) && numericValue < 10_000_000_000
      ? numericValue * 1000
      : numericValue;
  const date =
    Number.isFinite(timestamp) || typeof value === 'number' ? new Date(timestamp) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function getPublishedDateFromContent(value: string | undefined) {
  const metadataDate = value?.match(/Published (?:Time|Date):\s*([^\n]+)/i)?.[1];
  if (metadataDate) return formatPublishedDate(metadataDate);

  const inlineDate = value?.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/)?.[1];
  if (inlineDate) return formatPublishedDate(inlineDate);

  const chineseDate = value?.match(/\b(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/) ?? [];
  return chineseDate.length > 0
    ? formatPublishedDate(`${chineseDate[1]}-${chineseDate[2]}-${chineseDate[3]}`)
    : undefined;
}

function getPublishedDateFromUrl(value: string) {
  const compactDate = value.match(/(?:story|[/?_-])(20\d{2})(\d{2})(\d{2})(?:\D|$)/i);
  return compactDate
    ? formatPublishedDate(`${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`)
    : undefined;
}

function normalizeContent(value: string | undefined, title?: string) {
  if (!value) return undefined;

  const normalizedTitle = normalizeText(title)?.toLowerCase();
  const normalized = value
    .split(/\r?\n/)
    .filter(
      (line) => !/^(?:Title|URL Source|Published (?:Time|Date)|Markdown Content):/i.test(line),
    )
    .map((line) => cleanMarkdownLine(line))
    .filter((line) => line && line.toLowerCase() !== normalizedTitle && !isPageNavigationLine(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const readableContent = stripPageNavigation(normalized, title);

  if (!readableContent) return undefined;
  return readableContent.length > 600
    ? `${readableContent.slice(0, 600).trimEnd()}…`
    : readableContent;
}

function cleanMarkdownLine(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/(?:^|\s)#{1,6}\s+/g, ' ')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPageNavigationLine(value: string) {
  const navigationTerms = [
    '首页',
    '应用',
    '登录',
    '注册',
    '导航',
    '邮箱',
    '无障碍浏览',
    '快速导航',
    '站点地图',
  ];
  const navigationTermCount = navigationTerms.filter((term) => value.includes(term)).length;
  return navigationTermCount >= 3 || /javascript\s*:\s*void/i.test(value);
}

function stripPageNavigation(value: string, title?: string) {
  if (!value) return undefined;
  if (!isPageNavigationLine(value)) return value.replace(/^\)+\s*/, '');

  const titleIndex = title ? value.indexOf(title) : -1;
  if (titleIndex < 0) return undefined;

  return value
    .slice(titleIndex + (title?.length ?? 0))
    .replace(/^\s*[-|_–—:：]+\s*/, '')
    .trim();
}

function normalizeText(value: string | undefined) {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function getHttpUrl(value: string | undefined) {
  const url = value ? parseHttpUrl(value) : undefined;
  return url?.toString();
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function getFirstString(value: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const result = value[key];
    if (typeof result === 'string' && result.trim()) return result.trim();
  }

  return undefined;
}

function getFirstValue(value: Record<string, unknown>, keys: readonly string[]) {
  return keys.map((key) => value[key]).find((item) => item !== undefined && item !== null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
