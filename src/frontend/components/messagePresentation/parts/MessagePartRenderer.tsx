import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';

import type { ResolvedCitationText } from './citations';
import { CodePart } from './CodePart';
import { CompactPart } from './CompactPart';
import { ErrorPart } from './ErrorPart';
import { FilePart } from './FilePart';
import type { MessagePartRenderMode } from './MessageParts';
import { ReasoningPart } from './ReasoningPart';
import { SourceUrlPart } from './SourceUrlPart';
import { TextPart } from './TextPart';
import { ToolPartRenderer } from './tools/ToolPartRenderer';
import { isToolMessagePart } from './tools/toolPartState';
import { TranslationPart } from './TranslationPart';
import { UnknownPart } from './UnknownPart';

type MessagePartRendererProps = {
  isStreaming: boolean;
  part: CherryMessagePart;
  renderMode?: MessagePartRenderMode;
  resolvedText?: ResolvedCitationText;
};

export function MessagePartRenderer({
  isStreaming,
  part,
  renderMode = 'markdown',
  resolvedText,
}: MessagePartRendererProps) {
  if (isToolMessagePart(part)) {
    return <ToolPartRenderer part={part} />;
  }

  switch (part.type) {
    case 'text':
      return (
        <TextPart
          isStreaming={isStreaming}
          part={part}
          renderMode={renderMode}
          resolvedText={resolvedText}
        />
      );
    case 'reasoning':
      return <ReasoningPart isStreaming={isStreaming} part={part} />;
    case 'data-code':
      return <CodePart isStreaming={isStreaming} part={part} />;
    case 'data-compact':
      return <CompactPart isStreaming={isStreaming} part={part} />;
    case 'data-error':
      return <ErrorPart part={part} />;
    case 'data-translation':
      return <TranslationPart isStreaming={isStreaming} part={part} />;
    case 'data-video':
      return null;
    case 'file':
      return <FilePart part={part} />;
    case 'source-document':
      return null;
    case 'source-url':
      return <SourceUrlPart part={part} />;
    case 'step-start':
      return null;
    default:
      return <UnknownPart />;
  }
}
