import { useMemo } from 'react';
import { Text } from 'react-native';

import { type MentionSegment, splitToolMentions } from '@/frontend/utils/toolMentions';
import type { CherryMessagePart } from '@/shared/data/types/message';

import type { ResolvedCitationText } from './citations';
import type { MessagePartRenderMode } from './MessageParts';
import { PartMarkdown } from './PartMarkdown';

type TextPartProps = {
  isStreaming: boolean;
  isTextSelectionEnabled: boolean;
  part: Extract<CherryMessagePart, { type: 'text' }>;
  renderMode?: MessagePartRenderMode;
  resolvedText?: ResolvedCitationText;
};

function renderMentionSegments(segments: readonly MentionSegment[]) {
  const occurrenceById = new Map<string, number>();

  return segments.map((segment) => {
    if (!segment.id) {
      return segment.text;
    }

    const occurrence = occurrenceById.get(segment.id) ?? 0;
    occurrenceById.set(segment.id, occurrence + 1);

    return (
      <Text className="text-brand" key={`${segment.id}-${occurrence}`}>
        {segment.text}
      </Text>
    );
  });
}

/**
 * Plain text with its tool mentions picked out in the brand color, showing the
 * name the sender saw rather than the link syntax carrying it. Nested `Text`
 * rather than a markdown renderer: the mention is the only thing to style, and
 * reaching for a renderer would start parsing everything else the user typed
 * along with it.
 */
function PlainTextWithMentions({ text }: { text: string }) {
  const segments = useMemo(() => splitToolMentions(text), [text]);

  return <Text className="text-base text-foreground">{renderMentionSegments(segments)}</Text>;
}

export function TextPart({
  isStreaming,
  isTextSelectionEnabled,
  part,
  renderMode = 'markdown',
  resolvedText,
}: TextPartProps) {
  if (renderMode === 'plainText') {
    return <PlainTextWithMentions text={resolvedText?.plainText ?? part.text} />;
  }

  return (
    <PartMarkdown
      isStreaming={isStreaming}
      markdown={resolvedText?.markdown ?? part.text}
      selectable={isTextSelectionEnabled}
    />
  );
}
