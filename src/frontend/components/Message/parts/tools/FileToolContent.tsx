import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useMessageListDisclosureToggle } from '../../list/MessageListDisclosureContext';
import {
  type FileToolTextChunk,
  getFileToolContent,
  splitFileToolContent,
} from './fileToolContentPresentation';
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
    <View className="gap-2" testID="file-tool-content">
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
          pointerEvents="none"
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
      ) : (
        <FileToolCompletedContent isCode={content.isCode} text={content.text} />
      )}
    </View>
  );
}

function FileToolCompletedContent({ isCode, text }: { isCode: boolean; text: string }) {
  const chunks = splitFileToolContent(text);
  // Reading inline source detaches live-edge following just like expanding a process step.
  const stopFollowing = useMessageListDisclosureToggle();

  if (chunks.length <= 1) {
    return (
      <ScrollView
        alwaysBounceVertical={false}
        className="max-h-48 rounded-lg bg-code-block"
        contentContainerStyle={styles.content}
        nestedScrollEnabled
        onScrollBeginDrag={stopFollowing}
        testID="file-tool-completed-content"
      >
        <FileToolContentText isCode={isCode} text={text} />
      </ScrollView>
    );
  }

  return (
    <View className="h-48 overflow-hidden rounded-lg bg-code-block">
      <LegendList
        alwaysBounceVertical={false}
        contentContainerStyle={styles.content}
        data={chunks}
        extraData={isCode}
        keyExtractor={getContentChunkKey}
        nestedScrollEnabled
        onScrollBeginDrag={stopFollowing}
        recycleItems
        renderItem={renderContentChunk}
        style={styles.list}
        testID="file-tool-completed-content"
      />
    </View>
  );
}

function getContentChunkKey(chunk: FileToolTextChunk) {
  return String(chunk.offset);
}

function renderContentChunk({ item, extraData }: LegendListRenderItemProps<FileToolTextChunk>) {
  // The next text node supplies the line break between chunks; keep intentional blank lines.
  return <FileToolContentText isCode={Boolean(extraData)} text={item.text.replace(/\r?\n$/, '')} />;
}

function FileToolContentText({ isCode, text }: { isCode: boolean; text: string }) {
  return (
    <Text
      className={`text-muted-foreground text-xs ${isCode ? 'font-mono' : ''}`}
      selectable={false}
    >
      {text || '\u00A0'}
    </Text>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 12, paddingVertical: 8 },
  list: { flex: 1 },
});
