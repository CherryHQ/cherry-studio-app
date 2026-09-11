import { Image, Text, useWindowDimensions } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getPluginInlineIcon } from '@/frontend/utils/pluginIcons';
import { splitPluginReferences } from '@/frontend/utils/pluginReferences';
import { type MentionSegment, splitToolMentions } from '@/frontend/utils/toolMentions';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

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
      <Text className="text-link" key={`${segment.id}-${occurrence}`}>
        {segment.text}
      </Text>
    );
  });
}

/**
 * Plain text with its tool mentions picked out in the link color, showing the
 * name the sender saw rather than the link syntax carrying it. Nested `Text`
 * rather than a markdown renderer: the mention is the only thing to style, and
 * reaching for a renderer would start parsing everything else the user typed
 * along with it.
 */
function PlainTextWithMentions({ text, references }: { text: string; references?: unknown[] }) {
  const segments = splitPluginReferences(text, references);
  const color = useThemeColor('primary');
  const { fontScale } = useWindowDimensions();
  const textStyle = useResolveClassNames('text-base');
  const iconSize = (textStyle.fontSize ?? 16) * fontScale;

  return (
    <Text className="text-base text-foreground" accessibilityLabel={text}>
      {segments.map((segment) => {
        if (!segment.reference) return renderMentionSegments(splitToolMentions(segment.text));
        const icon = getPluginInlineIcon(segment.reference.pluginId);
        return (
          <Text className="text-primary" key={segment.reference.offset}>
            <Image
              accessible={false}
              accessibilityIgnoresInvertColors
              source={{ uri: `data:image/png;base64,${icon.base64}` }}
              style={{
                width: iconSize,
                height: iconSize,
                opacity: 0.8,
                tintColor: icon.tint ? color : undefined,
              }}
            />
            {'\u2009'}
            {segment.text}
          </Text>
        );
      })}
    </Text>
  );
}

export function TextPart({
  isStreaming,
  isTextSelectionEnabled,
  part,
  renderMode = 'markdown',
  resolvedText,
}: TextPartProps) {
  if (renderMode === 'plainText') {
    return (
      <PlainTextWithMentions
        text={resolvedText?.plainText ?? part.text}
        references={readCherryMeta(part)?.references}
      />
    );
  }

  return (
    <PartMarkdown
      isStreaming={isStreaming}
      markdown={resolvedText?.markdown ?? part.text}
      selectable={isTextSelectionEnabled}
    />
  );
}
