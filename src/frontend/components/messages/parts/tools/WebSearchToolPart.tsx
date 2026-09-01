import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { MessagePart } from '@cherrystudio/ui/components';
import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { getToolName, getToolStatusTone, isRecord, type ToolMessagePart } from './toolPartState';

type WebSearchToolPartProps = {
  part: ToolMessagePart;
};

type WebSearchResult = {
  content?: string;
  id: number | string;
  title: string;
  url: string;
};

const WEB_SEARCH_TOOL_NAMES = new Set([
  'web_search',
  'builtin_web_search',
  'builtin_web_search_preview',
]);

export function WebSearchToolPart({ part }: WebSearchToolPartProps) {
  const { t } = useTranslation();
  const query = getWebSearchQuery(part.input);
  const results = part.state === 'output-available' ? parseWebSearchResults(part.output) : [];
  const statusText = getWebSearchStatusText(part, results.length, t);
  const title = query || part.title?.trim() || t('chat.actions.webSearch');
  const detailTitle =
    results.length > 0 ? t('chat.webSearch.detailTitle', { count: results.length }) : title;
  const isSearching = part.state === 'input-streaming' || part.state === 'input-available';

  return (
    <MessagePart.Tool
      detailTitle={detailTitle}
      icon={SearchIcon}
      state={isSearching ? 'running' : 'complete'}
      statusText={statusText}
      statusTone={getToolStatusTone(part)}
      testID="web-search-tool-part"
      title={title}
    >
      {results.length === 0 ? (
        <Text className="text-foreground text-base italic" selectable>
          {statusText}
        </Text>
      ) : (
        results.map((result) => (
          <WebSearchResultCard key={`${result.id}-${result.url}`} result={result} />
        ))
      )}
    </MessagePart.Tool>
  );
}

function WebSearchResultCard({ result }: { result: WebSearchResult }) {
  const { t } = useTranslation();
  const domain = getSourceDomain(result.url);
  const faviconUrl = getFaviconUrl(result.url);
  const title = result.title || result.url;

  return (
    <Pressable
      accessibilityLabel={t('chat.webSearch.openResult', { domain, title })}
      accessibilityRole="link"
      className="gap-3 rounded-2xl border-continuous bg-card px-4 py-4 active:bg-secondary-active active:opacity-80"
      onPress={() => void openExternalUrl(result.url)}
    >
      <View className="flex-row items-center gap-2">
        <WebSearchFavicon domain={domain} faviconUrl={faviconUrl} key={faviconUrl ?? domain} />
        <Text className="min-w-0 flex-1 font-medium text-foreground text-sm" numberOfLines={1}>
          {domain}
        </Text>
      </View>
      <View className="gap-1.5">
        <Text className="font-semibold text-foreground text-base leading-6" numberOfLines={2}>
          {title}
        </Text>
        {result.content ? (
          <Text className="text-muted-foreground text-sm leading-5" numberOfLines={3}>
            {result.content}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

type FaviconStatus = 'failed' | 'loaded' | 'loading';

function WebSearchFavicon({ domain, faviconUrl }: { domain: string; faviconUrl?: string }) {
  const [status, setStatus] = useState<FaviconStatus>(faviconUrl ? 'loading' : 'failed');
  const fallbackInitial = domain.charAt(0).toUpperCase() || '?';

  return (
    <View
      accessibilityElementsHidden
      className="relative size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border border-continuous bg-secondary"
      importantForAccessibility="no-hide-descendants"
    >
      {status !== 'loaded' ? (
        <Text className="font-semibold text-foreground-tertiary text-xs">{fallbackInitial}</Text>
      ) : null}
      {faviconUrl && status !== 'failed' ? (
        <Image
          accessible={false}
          cachePolicy="memory-disk"
          contentFit="contain"
          onDisplay={() => setStatus('loaded')}
          onError={() => setStatus('failed')}
          recyclingKey={faviconUrl}
          source={{ uri: faviconUrl }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

export function isWebSearchToolPart(part: ToolMessagePart) {
  return isWebSearchToolName(getToolName(part));
}

export function isProviderWebSearchToolPart(part: ToolMessagePart) {
  return isWebSearchToolPart(part) && getCherryToolType(part) === 'provider';
}

function getWebSearchStatusText(
  part: ToolMessagePart,
  resultCount: number,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (part.state === 'output-available') {
    return resultCount === 0
      ? t('chat.webSearch.noResults')
      : t('chat.webSearch.resultCount', { count: resultCount });
  }

  if (part.state === 'output-error') {
    return part.errorText;
  }

  if (part.state === 'output-denied') {
    return t('chat.webSearch.denied');
  }

  if (part.state === 'approval-requested') {
    return t('chat.webSearch.approvalRequested');
  }

  if (part.state === 'approval-responded') {
    return part.approval.approved ? t('chat.webSearch.approved') : t('chat.webSearch.denied');
  }

  return t('chat.webSearch.searching');
}

function parseWebSearchResults(output: unknown): WebSearchResult[] {
  const rawResults = Array.isArray(output)
    ? output
    : isRecord(output) && Array.isArray(output.results)
      ? output.results
      : [];

  return rawResults.flatMap((item, index) => {
    if (!isRecord(item) || typeof item.url !== 'string' || !item.url.trim()) {
      return [];
    }

    return [
      {
        content: getWebSearchResultContent(item),
        id: typeof item.id === 'string' || typeof item.id === 'number' ? item.id : index + 1,
        title: typeof item.title === 'string' ? item.title.trim() : item.url,
        url: item.url.trim(),
      },
    ];
  });
}

function getWebSearchResultContent(result: Record<string, unknown>) {
  const content = [result.content, result.snippet, result.description].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );

  return content?.replace(/\s+/g, ' ').trim();
}

function getSourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (
      (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
      !parsedUrl.hostname
    ) {
      return undefined;
    }

    return new URL('/favicon.ico', parsedUrl.origin).toString();
  } catch {
    return undefined;
  }
}

function getWebSearchQuery(input: unknown) {
  if (!isRecord(input) || typeof input.query !== 'string') return '';
  return input.query.trim();
}

function isWebSearchToolName(toolName: string) {
  return WEB_SEARCH_TOOL_NAMES.has(toolName);
}

function getCherryToolType(part: ToolMessagePart) {
  const metadata = part.toolMetadata;
  const cherry = isRecord(metadata?.cherry) ? metadata.cherry : undefined;
  const tool = isRecord(cherry?.tool) ? cherry.tool : undefined;
  return typeof tool?.type === 'string' ? tool.type : undefined;
}
