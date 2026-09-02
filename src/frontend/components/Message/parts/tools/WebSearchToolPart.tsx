import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { enrichWebSources, parseWebSources } from '../webSource';
import { WebSourceCard } from '../WebSourceCard';
import { getToolStatusTone, type ToolMessagePart } from './toolPartState';

type WebSearchToolPartProps = {
  messageParts?: readonly CherryMessagePart[];
  part: ToolMessagePart;
};

export function WebSearchToolPart({ messageParts, part }: WebSearchToolPartProps) {
  const { t } = useTranslation();
  const rawResults = part.state === 'output-available' ? parseWebSources(part.output) : [];
  const results = messageParts ? enrichWebSources(rawResults, messageParts) : rawResults;
  const statusText = getWebSearchStatusText(part, results.length, t);
  const actionTitle = t('chat.builtinTool.web.search');
  const detailTitle =
    results.length > 0 ? t('chat.webSearch.detailTitle', { count: results.length }) : actionTitle;
  const isSearching = part.state === 'input-streaming' || part.state === 'input-available';

  return (
    <MessagePart.Tool
      detailTitle={detailTitle}
      detailVariant="source-list"
      state={isSearching ? 'running' : 'complete'}
      statusText={statusText}
      statusTone={getToolStatusTone(part)}
      testID="web-search-tool-part"
      title={actionTitle}
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
