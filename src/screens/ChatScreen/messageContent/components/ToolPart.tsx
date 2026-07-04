import type { CherryMessagePart } from '@/data/types/message';

import { PartPlaceholder } from './PartPlaceholder';

type ToolPartProps = {
  part: Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;
};

export function ToolPart({ part }: ToolPartProps) {
  return (
    <PartPlaceholder
      description={getToolDescription(part)}
      icon="tool"
      label={getToolLabel(part)}
    />
  );
}

function getToolLabel(part: ToolPartProps['part']) {
  const title = part.title?.trim();
  if (title) return title;

  const toolName = part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
  return `Tool: ${toolName}`;
}

function getToolDescription(part: ToolPartProps['part']) {
  if (part.state === 'input-streaming') {
    return 'Preparing input';
  }

  if (part.state === 'input-available') {
    return 'Input ready';
  }

  if (part.state === 'approval-requested') {
    return 'Approval requested';
  }

  if (part.state === 'approval-responded') {
    return part.approval.approved ? 'Approved' : 'Denied';
  }

  if (part.state === 'output-available') {
    return part.preliminary ? 'Preliminary output ready' : 'Output ready';
  }

  if (part.state === 'output-error') {
    return part.errorText;
  }

  return 'Output denied';
}
