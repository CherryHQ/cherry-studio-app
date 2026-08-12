import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';

import type { ResolvedCitationText } from '../citations';
import { CodePart } from './CodePart';
import { CompactPart } from './CompactPart';
import { ErrorPart } from './ErrorPart';
import { FilePart } from './FilePart';
import { isMcpToolPart, McpToolPart } from './McpToolPart';
import type { MessagePartRenderMode } from './MessageParts';
import { isMetaToolPart, MetaToolPart } from './MetaToolPart';
import { isProviderConfigToolPart, ProviderConfigToolPart } from './ProviderConfigToolPart';
import { ReasoningPart } from './ReasoningPart';
import { SourceDocumentPart } from './SourceDocumentPart';
import { SourceUrlPart } from './SourceUrlPart';
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
  isStreaming: boolean;
  part: CherryMessagePart;
  renderMode?: MessagePartRenderMode;
  resolvedText?: ResolvedCitationText;
};

export function MessagePart({
  isStreaming,
  part,
  renderMode = 'markdown',
  resolvedText,
}: MessagePartProps) {
  const partType = part.type;

  if (isToolMessagePart(part)) {
    if (isProviderWebSearchToolPart(part)) {
      return null;
    }

    if (isWebSearchToolPart(part)) {
      return <WebSearchToolPart part={part} />;
    }

    if (isProviderConfigToolPart(part)) {
      return <ProviderConfigToolPart part={part} />;
    }

    if (isMetaToolPart(part)) {
      return <MetaToolPart part={part} />;
    }

    if (isMcpToolPart(part)) {
      return <McpToolPart part={part} />;
    }

    return <ToolPart part={part} />;
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
      return <VideoPart part={part} />;
    case 'file':
      return <FilePart part={part} />;
    case 'source-document':
      return <SourceDocumentPart part={part} />;
    case 'source-url':
      return <SourceUrlPart part={part} />;
    case 'step-start':
      return null;
    default:
      return <UnknownPart type={partType} />;
  }
}

function isToolMessagePart(
  part: CherryMessagePart,
): part is Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }> {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}
