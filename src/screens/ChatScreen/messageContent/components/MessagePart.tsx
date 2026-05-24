import type { CherryMessagePart } from '@/data/types/message';

import { CodePart } from './CodePart';
import { CompactPart } from './CompactPart';
import { ErrorPart } from './ErrorPart';
import { FilePart } from './FilePart';
import { ReasoningPart } from './ReasoningPart';
import { SourceDocumentPart } from './SourceDocumentPart';
import { SourceUrlPart } from './SourceUrlPart';
import { StepStartPart } from './StepStartPart';
import { TextPart } from './TextPart';
import { ToolPart } from './ToolPart';
import { TranslationPart } from './TranslationPart';
import { UnknownPart } from './UnknownPart';
import { VideoPart } from './VideoPart';

type MessagePartProps = {
  part: CherryMessagePart;
};

export function MessagePart({ part }: MessagePartProps) {
  const partType = part.type;

  if (isStaticToolPart(part)) {
    return <ToolPart part={part} />;
  }

  switch (part.type) {
    case 'text':
      return <TextPart part={part} />;
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
    case 'dynamic-tool':
      return <ToolPart part={part} />;
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

function isStaticToolPart(
  part: CherryMessagePart,
): part is Extract<CherryMessagePart, { type: `tool-${string}` }> {
  return part.type.startsWith('tool-');
}
