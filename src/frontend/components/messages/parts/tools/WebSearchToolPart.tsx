import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { enrichWebSources, parseWebSources } from '../webSource';
import { WebSourceCard } from '../WebSourceCard';
import { getToolName, getToolStatusTone, isRecord, type ToolMessagePart } from './toolPartState';

type WebSearchToolPartProps = {
  messageParts?: readonly CherryMessagePart[];
  part: ToolMessagePart;
};

const WEB_SEARCH_TOOL_NAMES = new Set([
  'web_search',
  'builtin_web_search',
  'builtin_web_search_preview',
]);

export function WebSearchToolPart({ messageParts, part }: WebSearchToolPartProps) {
  const { t } = useTranslation();
  const query = getWebSearchQuery(part.input);
  const rawResults = part.state === 'output-available' ? parseWebSources(part.output) : [];
  const results = messageParts ? enrichWebSources(rawResults, messageParts) : rawResults;
  const statusText = getWebSearchStatusText(part, results.length, t);
  const title = query || part.title?.trim() || t('chat.actions.webSearch');
  const detailTitle =
    results.length > 0 ? t('chat.webSearch.detailTitle', { count: results.length }) : title;
  const isSearching = part.state === 'input-streaming' || part.state === 'input-available';

  return (
    <MessagePart.Tool
      detailTitle={detailTitle}
      detailVariant="source-list"
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
          <WebSourceCard key={`${result.id}-${result.url}`} source={result} />
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
