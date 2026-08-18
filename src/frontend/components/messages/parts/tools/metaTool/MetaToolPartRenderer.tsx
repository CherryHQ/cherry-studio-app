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
    case 'tool_inspect':
      return <MetaToolInspectPart part={part} />;
    case 'tool_invoke':
      return <MetaToolInvokePart part={part} />;
    case 'tool_exec':
      return <MetaToolExecPart part={part} />;
    default:
      return null;
  }
}

export { isMetaToolPart };
