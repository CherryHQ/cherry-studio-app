import type { CherryMessagePart } from '@/data/types/message';

import { CodePart } from './CodePart';
import { CompactPart } from './CompactPart';
import { ErrorPart } from './ErrorPart';
import { FilePart } from './FilePart';
import type { MessagePartRenderMode } from './MessageParts';
import { isMetaToolSearchPart, MetaToolSearchPart } from './MetaToolSearchPart';
import { ReasoningPart } from './ReasoningPart';
import { SourceDocumentPart } from './SourceDocumentPart';
import { SourceUrlPart } from './SourceUrlPart';
import { StepStartPart } from './StepStartPart';
import { TextPart } from './TextPart';
import { ToolPart } from './ToolPart';
import { TranslationPart } from './TranslationPart';
import { UnknownPart } from './UnknownPart';
import { VideoPart } from './VideoPart';
import {
  isProviderWebSearchToolPart,
  isWebSearchToolPart,
  WebSearchToolPart,
} from './WebSearchToolPart';

type MessagePartProps = {
  part: CherryMessagePart;
  renderMode?: MessagePartRenderMode;
};

export function MessagePart({ part, renderMode = 'markdown' }: MessagePartProps) {
  const partType = part.type;

  if (isToolMessagePart(part)) {
    if (isProviderWebSearchToolPart(part)) {
      return null;
    }

    if (isWebSearchToolPart(part)) {
      return <WebSearchToolPart part={part} />;
    }

    if (isMetaToolSearchPart(part)) {
      return <MetaToolSearchPart part={part} />;
    }

    return <ToolPart part={part} />;
  }

  switch (part.type) {
    case 'text':
      return <TextPart part={part} renderMode={renderMode} />;
    case 'reasoning':
      return <ReasoningPart part={part} />;
    case 'data-code':
      return <CodePart part={part} />;
    case 'data-compact':
      return <CompactPart part={part} />;
    case 'data-error':
      return <ErrorPart part={part} />;
    case 'data-translation':
      return <TranslationPart part={part} />;
    case 'data-video':
      return <VideoPart part={part} />;
    case 'file':
      return <FilePart part={part} />;
    case 'source-document':
      return <SourceDocumentPart part={part} />;
    case 'source-url':
      return <SourceUrlPart part={part} />;
    case 'step-start':
      return <StepStartPart />;
    default:
      return <UnknownPart type={partType} />;
  }
}

function isToolMessagePart(
  part: CherryMessagePart,
): part is Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }> {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}
