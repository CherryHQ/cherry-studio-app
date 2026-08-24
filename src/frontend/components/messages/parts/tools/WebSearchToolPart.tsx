import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { SourceLink } from '../SourceLink';
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
  const isSearching = part.state === 'input-streaming' || part.state === 'input-available';

  return (
    <MessagePart.Tool
      closeAccessibilityLabel={t('common.close')}
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
          <SourceLink
            key={`${result.id}-${result.url}`}
            label={result.title || result.url}
            url={result.url}
          />
        ))
      )}
    </MessagePart.Tool>
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

function isWebSearchToolName(toolName: string) {
  return WEB_SEARCH_TOOL_NAMES.has(toolName);
}

function getCherryToolType(part: ToolMessagePart) {
  const metadata = part.toolMetadata;
  const cherry = isRecord(metadata?.cherry) ? metadata.cherry : undefined;
  const tool = isRecord(cherry?.tool) ? cherry.tool : undefined;
  return typeof tool?.type === 'string' ? tool.type : undefined;
}
