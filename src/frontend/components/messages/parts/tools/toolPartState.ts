import type { CherryMessagePart } from '@/shared/data/types/message';

export type ToolMessagePart = Extract<
  CherryMessagePart,
  { type: 'dynamic-tool' | `tool-${string}` }
>;

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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
