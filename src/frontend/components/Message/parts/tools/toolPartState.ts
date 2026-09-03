import type { CherryMessagePart } from '@/shared/data/types/message';

export type ToolMessagePart = Extract<
  CherryMessagePart,
  { type: 'dynamic-tool' | `tool-${string}` }
>;

const WEB_SEARCH_TOOL_NAMES = new Set([
  'web_search',
  'builtin_web_search',
  'builtin_web_search_preview',
]);

export type ToolStatusTone = 'danger' | 'default' | 'warning';

export function isToolMessagePart(part: CherryMessagePart): part is ToolMessagePart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

export function getToolName(part: ToolMessagePart) {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
}

export function getToolDisplayState(part: ToolMessagePart): 'complete' | 'running' {
  return part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    (part.state === 'approval-responded' && part.approval.approved)
    ? 'running'
    : 'complete';
}

export function getToolStatusTone(
  part: ToolMessagePart,
  isError = part.state === 'output-error',
): ToolStatusTone {
  if (
    part.state === 'output-denied' ||
    (part.state === 'approval-responded' && !part.approval.approved)
  ) {
    return 'warning';
  }

  return isError ? 'danger' : 'default';
}

export function isWebSearchToolPart(part: ToolMessagePart) {
  return WEB_SEARCH_TOOL_NAMES.has(getToolName(part));
}

/** A provider-executed web search; its renderer suppresses it entirely. */
export function isProviderWebSearchToolPart(part: ToolMessagePart) {
  return isWebSearchToolPart(part) && getCherryToolType(part) === 'provider';
}

function getCherryToolType(part: ToolMessagePart) {
  const metadata = part.toolMetadata;
  const cherry = isRecord(metadata?.cherry) ? metadata.cherry : undefined;
  const tool = isRecord(cherry?.tool) ? cherry.tool : undefined;
  return typeof tool?.type === 'string' ? tool.type : undefined;
}

export type ToolGroupSummary = {
  dangerCount: number;
  state: 'complete' | 'running';
  tone: ToolStatusTone;
  warningCount: number;
};

/** Derives one group-level state and tone from a run of tool calls. */
export function deriveToolGroupSummary(parts: readonly ToolMessagePart[]): ToolGroupSummary {
  const dangerCount = parts.filter((part) => getToolStatusTone(part) === 'danger').length;
  const warningCount = parts.filter((part) => getToolStatusTone(part) === 'warning').length;

  return {
    dangerCount,
    state: parts.some((part) => getToolDisplayState(part) === 'running') ? 'running' : 'complete',
    tone: dangerCount > 0 ? 'danger' : warningCount > 0 ? 'warning' : 'default',
    warningCount,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
