import {
  AnchoredInfoPopover,
  ContextMenuExclusion,
  type InfoPopoverAnchor,
} from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Text, useWindowDimensions } from 'react-native';
import { useResolveClassNames, useUniwind } from 'uniwind';

import pluginInlineIcons from '@/assets/plugins/inline-icons.json';
import skillInlineIcon from '@/assets/skills/inline-icon.json';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import type { ResolvedCitationText } from '@/frontend/utils/messageCitations';
import { getPluginInlineIcon } from '@/frontend/utils/pluginIcons';
import { type MentionSegment, splitToolMentions } from '@/frontend/utils/toolMentions';
import type { MessageQuote } from '@/shared/contracts/agent';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import type { MessagePartRenderMode } from './MessageParts';
import { PartMarkdown } from './PartMarkdown';
import { splitTextReferences } from './textReferences';

type TextPartProps = {
  isStreaming: boolean;
  /** Offers the host's selection action on this text; absent outside a message body. */
  messageId?: string;
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
function PlainTextWithMentions({
  text,
  references,
  quotes,
  quoteAuthorName,
}: {
  text: string;
  references?: unknown[];
  quotes?: unknown[];
  quoteAuthorName?: string;
}) {
  const { t } = useTranslation();
  const segments = splitTextReferences(text, references, quotes);
  const [preview, setPreview] = useState<{ anchor: InfoPopoverAnchor; text: string }>();
  const color = useThemeColor('link');
  const { theme } = useUniwind();
  const { fontScale } = useWindowDimensions();
  const textStyle = useResolveClassNames('text-base');
  const iconSize = (textStyle.fontSize ?? 16) * fontScale;

  return (
    <>
      <Text className="text-base text-foreground" accessibilityLabel={text} selectable>
        {segments.map((segment) => {
          if (!segment.reference) return renderMentionSegments(splitToolMentions(segment.text));
          if (segment.reference.type === 'quote')
            return (
              <InlineQuoteReference
                key={segment.reference.offset}
                quote={segment.reference.quote}
                onOpen={(anchor, quoteText) => setPreview({ anchor, text: quoteText })}
              />
            );
          if (segment.reference.type === 'ssh')
            return (
              <Text className="text-link" key={segment.reference.offset}>
                {segment.text}
              </Text>
            );
          const icon =
            segment.reference.type === 'plugin'
              ? getPluginInlineIcon(segment.reference.pluginId, theme)
              : segment.reference.type === 'selection'
                ? { base64: pluginInlineIcons['file-text'], tint: true }
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
      <AnchoredInfoPopover
        anchor={preview?.anchor}
        text={preview?.text ?? ''}
        caption={quoteAuthorName ?? t('chat.quote.assistant')}
        onClose={() => setPreview(undefined)}
      />
    </>
  );
}

function InlineQuoteReference({
  quote,
  onOpen,
}: {
  quote: MessageQuote;
  onOpen: (anchor: InfoPopoverAnchor, text: string) => void;
}) {
  return (
    <Text
      className="text-link"
      accessibilityRole="button"
      accessibilityLabel={quote.text}
      // Nested Text has no layout box; anchor to the native press instead.
      onPress={({ nativeEvent: { pageX, pageY } }) =>
        onOpen({ pageX, pageY, width: 0, height: 0 }, quote.text)
      }
    >
      {quote.reference?.label}
    </Text>
  );
}

export function TextPart({
  isStreaming,
  messageId,
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
          quotes={readCherryMeta(part)?.quotes}
          quoteAuthorName={readCherryMeta(part)?.quoteAuthor?.name}
        />
      ) : (
        <PartMarkdown
          isStreaming={isStreaming}
          markdown={resolvedText?.markdown ?? part.text}
          messageId={messageId}
        />
      )}
    </ContextMenuExclusion>
  );
}
