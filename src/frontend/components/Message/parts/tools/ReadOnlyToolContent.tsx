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
  failed,
}: {
  name: string;
  input?: unknown;
  output?: unknown;
  failed?: boolean;
}) {
  const { t } = useTranslation();
  const known = citableToolName(
    name,
    input,
    name === 'tool_call' || name === 'tool_invoke' || isCherryCitationOutput(output),
  );
  const value = unwrapCitationOutput(output);
  const isMcp =
    name.startsWith('mcp__') ||
    (isRecord(output) && isRecord(output.metadata) && output.metadata.type === 'mcp');
  const mcpValue = isMcp ? resolveMcpOutput(output, failed) : undefined;
  const hasStructuredMcp =
    isRecord(mcpValue) && (Array.isArray(mcpValue.content) || 'structuredContent' in mcpValue);
  const error =
    isMcp && hasStructuredMcp
      ? undefined
      : resolveToolError(value, failed, t('chat.tool.callError'));
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
        <McpOutputSection normalized={normalizeMcpResult(mcpValue)} />
      ) : (
        <GenericToolContent output={value} />
      )}
      <MessageDetailValue title={t('chat.tool.arguments')} value={input} />
    </>
  );
}

function resolveMcpOutput(output: unknown, failed?: boolean): unknown {
  const base =
    isRecord(output) && 'value' in output && Array.isArray(output.artifacts)
      ? output.value
      : output;
  if (isRecord(base) && isRecord(base.metadata) && 'content' in base) {
    // Keep top-level MCP result envelopes intact so content blocks (images) and isError survive.
    if (Array.isArray(base.content)) return withMcpFailure(base, failed);
    if (typeof base.content === 'string' && (base.isError === true || failed)) {
      return { content: [{ type: 'text', text: base.content }], isError: true };
    }
    return withMcpFailure(unwrapCitationOutput(base), failed);
  }
  return withMcpFailure(unwrapCitationOutput(output), failed);
}

function withMcpFailure(result: unknown, failed?: boolean): unknown {
  if (
    !failed ||
    !isRecord(result) ||
    result.isError === true ||
    (!Array.isArray(result.content) && !('structuredContent' in result))
  ) {
    return result;
  }
  return { ...result, isError: true };
}

function resolveToolError(
  value: unknown,
  failed: boolean | undefined,
  fallback: string,
): string | undefined {
  if (isRecord(value) && value.status === 'error') {
    return typeof value.message === 'string' && value.message.trim() ? value.message : fallback;
  }
  if (!failed) return undefined;
  if (typeof value === 'string') return value.trim() || fallback;
  if (isRecord(value)) {
    if (typeof value.message === 'string' && value.message.trim()) return value.message;
    if (typeof value.error === 'string' && value.error.trim()) return value.error;
  }
  return fallback;
}
