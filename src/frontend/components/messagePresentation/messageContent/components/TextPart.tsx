import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { useMemo } from 'react';
import { Text } from 'react-native';

import { splitToolMentions } from '@/frontend/utils/toolMentions';

import type { ResolvedCitationText } from '../citations';
import type { MessagePartRenderMode } from './MessageParts';
import { PartMarkdown } from './PartMarkdown';

type TextPartProps = {
  isStreaming: boolean;
  part: Extract<CherryMessagePart, { type: 'text' }>;
  renderMode?: MessagePartRenderMode;
  resolvedText?: ResolvedCitationText;
};

/**
 * Plain text with its tool mentions picked out in the brand color, showing the
 * name the sender saw rather than the link syntax carrying it. Nested `Text`
 * rather than a markdown renderer: the mention is the only thing to style, and
 * reaching for a renderer would start parsing everything else the user typed
 * along with it.
 */
function PlainTextWithMentions({ text }: { text: string }) {
  const segments = useMemo(() => splitToolMentions(text), [text]);

  return (
    <Text className="text-base text-foreground">
      {segments.map((segment, index) =>
        segment.id ? (
          // Segments are derived from the text in order and never reordered, so
          // the index is a stable identity here.
          <Text className="text-brand" key={index}>
            {segment.text}
          </Text>
        ) : (
          segment.text
        ),
      )}
    </Text>
  );
}

export function TextPart({
  isStreaming,
  part,
  renderMode = 'markdown',
  resolvedText,
}: TextPartProps) {
  if (renderMode === 'plainText') {
    return <PlainTextWithMentions text={resolvedText?.plainText ?? part.text} />;
  }

  return <PartMarkdown isStreaming={isStreaming} markdown={resolvedText?.markdown ?? part.text} />;
}
