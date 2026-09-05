import { getToolName, type ToolMessagePart } from '../toolPartState';
import { MetaToolExecPart } from './MetaToolExecPart';
import { MetaToolInspectPart } from './MetaToolInspectPart';
import { MetaToolInvokePart } from './MetaToolInvokePart';
import { MetaToolSearchPart } from './MetaToolSearchPart';
import { isMetaToolPart } from './metaToolState';

type MetaToolPartRendererProps = {
  part: ToolMessagePart;
};

export function MetaToolPartRenderer({ part }: MetaToolPartRendererProps) {
  switch (getToolName(part)) {
    case 'tool_search':
      return <MetaToolSearchPart part={part} />;
    case 'tool_describe':
      return <MetaToolInspectPart part={part} toolName="tool_describe" />;
    case 'tool_inspect':
      return <MetaToolInspectPart part={part} toolName="tool_inspect" />;
    case 'tool_call':
      return <MetaToolInvokePart part={part} toolName="tool_call" />;
    case 'tool_invoke':
      return <MetaToolInvokePart part={part} toolName="tool_invoke" />;
    case 'tool_exec':
      return <MetaToolExecPart part={part} />;
    default:
      return null;
  }
}

export { isMetaToolPart };
