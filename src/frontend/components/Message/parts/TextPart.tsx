import { ContextMenuExclusion } from '@cherrystudio/ui/components';
import { Image, Text, useWindowDimensions } from 'react-native';
import { useResolveClassNames, useUniwind } from 'uniwind';

import skillInlineIcon from '@/assets/skills/inline-icon.json';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { getPluginInlineIcon } from '@/frontend/utils/pluginIcons';
import { type MentionSegment, splitToolMentions } from '@/frontend/utils/toolMentions';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import type { ResolvedCitationText } from './citations';
import type { MessagePartRenderMode } from './MessageParts';
import { PartMarkdown } from './PartMarkdown';
import { splitTextReferences } from './textReferences';

type TextPartProps = {
  isStreaming: boolean;
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
  const segments = splitTextReferences(text, references);
  const color = useThemeColor('link');
  const { theme } = useUniwind();
  const { fontScale } = useWindowDimensions();
  const textStyle = useResolveClassNames('text-base');
  const iconSize = (textStyle.fontSize ?? 16) * fontScale;

  return (
    <Text className="text-base text-foreground" accessibilityLabel={text} selectable>
      {segments.map((segment) => {
        if (!segment.reference) return renderMentionSegments(splitToolMentions(segment.text));
        const icon =
          segment.reference.type === 'plugin'
            ? getPluginInlineIcon(segment.reference.pluginId, theme)
            : { base64: skillInlineIcon['tool-case'], tint: true };
        return (
          <Text className="text-link" key={segment.reference.offset}>
            <Image
              accessible={false}
              accessibilityIgnoresInvertColors
              source={{ uri: `data:image/png;base64,${icon.base64}` }}
              style={{
                width: iconSize,
                height: iconSize,
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
  part,
  renderMode = 'markdown',
  resolvedText,
}: TextPartProps) {
  // Native selection, links and block menus own touches inside the text region.
  // Keep the boundary mounted while streaming so completion preserves the native text.
  return (
    <ContextMenuExclusion>
      {renderMode === 'plainText' ? (
        <PlainTextWithMentions
          text={resolvedText?.plainText ?? part.text}
          references={readCherryMeta(part)?.references}
        />
      ) : (
        <PartMarkdown isStreaming={isStreaming} markdown={resolvedText?.markdown ?? part.text} />
      )}
    </ContextMenuExclusion>
  );
}
