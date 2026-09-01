import type { CherryMessagePart } from '@/shared/data/types/message';

import { EditFileToolPart, isEditFileToolPart } from './EditFileToolPart';
import { GenericToolPart } from './GenericToolPart';
import { isMcpToolPart, McpToolPart } from './McpToolPart';
import { isMetaToolPart, MetaToolPartRenderer } from './metaTool/MetaToolPartRenderer';
import type { ToolMessagePart } from './toolPartState';
import {
  isProviderWebSearchToolPart,
  isWebSearchToolPart,
  WebSearchToolPart,
} from './WebSearchToolPart';
import { isWriteFileToolPart, WriteFileToolPart } from './WriteFileToolPart';

type ToolPartRendererProps = {
  messageParts?: readonly CherryMessagePart[];
  part: ToolMessagePart;
};

export function ToolPartRenderer({ messageParts, part }: ToolPartRendererProps) {
  if (isProviderWebSearchToolPart(part)) {
    return null;
  }

  if (isWebSearchToolPart(part)) {
    return <WebSearchToolPart messageParts={messageParts} part={part} />;
  }

  if (isMetaToolPart(part)) {
    return <MetaToolPartRenderer part={part} />;
  }

  if (isMcpToolPart(part)) {
    return <McpToolPart part={part} />;
  }

  if (isWriteFileToolPart(part)) {
    return <WriteFileToolPart part={part} />;
  }

  if (isEditFileToolPart(part)) {
    return <EditFileToolPart part={part} />;
  }

  return <GenericToolPart part={part} />;
}
