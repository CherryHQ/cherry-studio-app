import { Text, View } from 'react-native';

import { getFileToolContent } from './fileToolContentPresentation';
import { useToolInputPreview } from './ToolInputPreviewContext';
import type { ToolMessagePart } from './toolPartState';

const PREVIEW_LINE_COUNT = 4;
const PREVIEW_LINE_CHARACTERS = 160;

/** Only this leaf subscribes to file-generation ticks; native work stays bounded by the preview. */
export function FileToolContent({
  messageId,
  part,
}: {
  messageId?: string;
  part: ToolMessagePart;
}) {
  const live = useToolInputPreview(messageId, part.toolCallId);
  const content = getFileToolContent(part, live);
  if (!content) return null;

  const lines = content.isStreaming
    ? content.text.trimEnd().split(/\r?\n/).slice(-PREVIEW_LINE_COUNT)
    : [];

  return (
    <View className="gap-2" pointerEvents="none" testID="file-tool-content">
      {content.name ? (
        <Text
          className="font-mono text-muted-foreground text-xs"
          ellipsizeMode="middle"
          numberOfLines={1}
          selectable={false}
        >
          {content.name}
        </Text>
      ) : null}
      {content.isStreaming ? (
        <View
          accessibilityElementsHidden
          className="rounded-lg bg-code-block px-3 py-2"
          importantForAccessibility="no-hide-descendants"
          testID="file-tool-generation-preview"
        >
          {Array.from({ length: PREVIEW_LINE_COUNT }, (_, index) => {
            const line = lines[index - (PREVIEW_LINE_COUNT - lines.length)] ?? '';
            // Keep the newest characters, including for minified source. Never begin on half
            // a surrogate pair. Stable line slots reserve space without fixed font dimensions.
            const text = line.slice(-PREVIEW_LINE_CHARACTERS).replace(/^[\uDC00-\uDFFF]/, '');
            return (
              <Text
                className={`text-foreground-tertiary text-xs ${content.isCode ? 'font-mono' : ''}`}
                ellipsizeMode="head"
                key={index}
                numberOfLines={1}
                selectable={false}
              >
                {text || '\u00A0'}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
