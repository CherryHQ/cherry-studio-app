import { Accordion } from 'heroui-native/accordion';
import { SearchIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { SourceUrlItem } from './SourceUrlItem';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

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
  const isSearching = part.state === 'input-streaming' || part.state === 'input-available';

  if (results.length === 0) {
    return (
      <View className="rounded-lg border border-border bg-surface-secondary p-3">
        <WebSearchHeaderContent isSearching={isSearching} statusText={statusText} title={title} />
      </View>
    );
  }

  return (
    <Accordion
      className="overflow-hidden rounded-lg border border-border bg-surface-secondary"
      hideSeparator
      isCollapsible
      selectionMode="single"
    >
      <Accordion.Item value="web-search-results">
        <Accordion.Trigger className="min-h-0 px-3 py-3">
          <WebSearchHeaderContent isSearching={isSearching} statusText={statusText} title={title} />
          <Accordion.Indicator
            animation={{ rotation: { value: [-90, 0] } }}
            iconProps={{ size: 16 }}
          />
        </Accordion.Trigger>
        <Accordion.Content className="px-3 pt-0 pb-3">
          <View className="gap-0.5 border-border border-t pt-2">
            {results.map((result) => (
              <SourceUrlItem
                key={`${result.id}-${result.url}`}
                label={result.title || result.url}
                url={result.url}
                variant="listItem"
              />
            ))}
          </View>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}

function WebSearchHeaderContent({
  isSearching,
  statusText,
  title,
}: {
  isSearching: boolean;
  statusText: string;
  title: string;
}) {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      {isSearching ? (
        <ActivityIndicator size="small" />
      ) : (
        <SearchIcon className="size-4 text-default-foreground" strokeWidth={2} />
      )}
      <Text
        className="min-w-0 flex-1 font-semibold text-default-foreground text-sm"
        numberOfLines={1}
        selectable
      >
        {title}
      </Text>
      <Text
        className="max-w-[42%] shrink-0 text-foreground-muted text-xs"
        numberOfLines={1}
        selectable
      >
        {statusText}
      </Text>
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
        content: typeof item.content === 'string' ? item.content : undefined,
        id: typeof item.id === 'string' || typeof item.id === 'number' ? item.id : index + 1,
        title: typeof item.title === 'string' ? item.title : item.url,
        url: item.url,
      },
    ];
  });
}

function getWebSearchQuery(input: unknown) {
  if (!isRecord(input) || typeof input.query !== 'string') return '';
  return input.query.trim();
}

function getToolName(part: ToolMessagePart) {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
