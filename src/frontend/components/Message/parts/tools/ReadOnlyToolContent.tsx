import { normalizeMcpResult } from '@cherrystudio/universal/ai/tools/mcpResult';
import { useTranslation } from 'react-i18next';

import { MessageDetailText, MessageDetailValue } from '@/frontend/components/MessageDetail';
import {
  citableToolName,
  isCherryCitationOutput,
  unwrapCitationOutput,
} from '@/frontend/utils/messageCitations';

import { parseWebSources } from '../webSource';
import { GenericToolContent } from './GenericToolPart';
import { McpOutputSection } from './McpToolPart';
import { isRecord } from './toolPartState';
import { WebSearchToolContent } from './WebSearchToolPart';

/** Completed result content only. No Apps linkage, local resource source, or execution adapter. */
export function ReadOnlyToolContent({
  name,
  input,
  output,
}: {
  name: string;
  input?: unknown;
  output?: unknown;
}) {
  const { t } = useTranslation();
  const known = citableToolName(name, input, isCherryCitationOutput(output));
  const value = unwrapCitationOutput(output);
  const isMcp =
    name.startsWith('mcp__') ||
    (isRecord(output) && isRecord(output.metadata) && output.metadata.type === 'mcp');
  const error =
    isRecord(value) && value.status === 'error'
      ? typeof value.message === 'string'
        ? value.message
        : t('chat.tool.callError')
      : undefined;
  return (
    <>
      {error ? (
        <MessageDetailText tone="danger" title={t('chat.tool.error')} value={error} />
      ) : known === 'web_search' || known === 'web_fetch' ? (
        <WebSearchToolContent
          results={parseWebSources(value)}
          emptyText={t('chat.webSearch.noResults')}
        />
      ) : isMcp ? (
        <McpOutputSection normalized={normalizeMcpResult(value)} />
      ) : (
        <GenericToolContent output={value} />
      )}
      <MessageDetailValue title={t('chat.tool.arguments')} value={input} />
    </>
  );
}
