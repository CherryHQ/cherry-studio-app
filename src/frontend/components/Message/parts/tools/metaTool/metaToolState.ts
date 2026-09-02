import type { useTranslation } from 'react-i18next';

import { getToolName, isRecord, type ToolMessagePart } from '../toolPartState';

export type MetaToolName =
  | 'tool_search'
  | 'tool_inspect'
  | 'tool_describe'
  | 'tool_invoke'
  | 'tool_call'
  | 'tool_exec';

export type ToolSearchNamespace = {
  namespace: string;
  tools: { name: string }[];
};

export const META_TOOL_TITLE_KEYS = {
  tool_exec: 'chat.metaToolExec.title',
  tool_call: 'chat.metaToolInvoke.title',
  tool_describe: 'chat.metaToolInspect.title',
  tool_inspect: 'chat.metaToolInspect.title',
  tool_invoke: 'chat.metaToolInvoke.title',
  tool_search: 'chat.metaToolSearch.title',
} as const;

const META_TOOL_NAMES = new Set<MetaToolName>([
  'tool_search',
  'tool_describe',
  'tool_inspect',
  'tool_call',
  'tool_invoke',
  'tool_exec',
]);

export function isMetaToolPart(part: ToolMessagePart) {
  return META_TOOL_NAMES.has(getToolName(part) as MetaToolName);
}

export function getMetaToolStatusText(
  part: ToolMessagePart,
  toolName: MetaToolName,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (part.state === 'output-available') {
    if (toolName === 'tool_search') {
      const namespaces = parseToolSearchNamespaces(part.output);
      const toolCount = namespaces.reduce((count, group) => count + group.tools.length, 0);
      return toolCount === 0
        ? t('chat.metaToolSearch.noResults')
        : t('chat.metaToolSearch.resultCount', { count: toolCount });
    }

    if (
      toolName === 'tool_describe' ||
      toolName === 'tool_inspect' ||
      toolName === 'tool_call' ||
      toolName === 'tool_invoke'
    ) {
      const input = isRecord(part.input) ? part.input : undefined;
      const targetToolName = typeof input?.name === 'string' ? input.name.trim() : '';
      return targetToolName || undefined;
    }

    return undefined;
  }

  if (part.state === 'output-error') {
    return t('chat.tool.callError');
  }

  if (part.state === 'output-denied') {
    return t('chat.tool.runDenied');
  }

  if (part.state === 'approval-requested') {
    return t('chat.tool.approvalRequested');
  }

  if (part.state === 'approval-responded') {
    return part.approval.approved ? t('chat.tool.approved') : t('chat.tool.runDenied');
  }

  return toolName === 'tool_search' ? t('chat.metaToolSearch.searching') : t('chat.tool.running');
}

export function parseToolSearchNamespaces(output: unknown): ToolSearchNamespace[] {
  if (!isRecord(output) || !Array.isArray(output.matchedNamespaces)) {
    return [];
  }

  return output.matchedNamespaces.flatMap((group) => {
    if (!isRecord(group) || typeof group.namespace !== 'string') {
      return [];
    }

    const tools = Array.isArray(group.tools)
      ? group.tools.flatMap((tool) =>
          isRecord(tool) && typeof tool.name === 'string' && tool.name.trim()
            ? [{ name: tool.name }]
            : [],
        )
      : [];

    return [{ namespace: group.namespace, tools }];
  });
}
