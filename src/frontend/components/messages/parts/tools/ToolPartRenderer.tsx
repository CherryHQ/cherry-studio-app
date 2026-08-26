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
  part: ToolMessagePart;
};

export function ToolPartRenderer({ part }: ToolPartRendererProps) {
  if (isProviderWebSearchToolPart(part)) {
    return null;
  }

  if (isWebSearchToolPart(part)) {
    return <WebSearchToolPart part={part} />;
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

  return <GenericToolPart part={part} />;
}
