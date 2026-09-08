import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import { createCodeBlockMarkdown } from '@/frontend/utils/createCodeBlockMarkdown';

import { getFileToolContent } from './fileToolContentPresentation';
import { useToolInputPreview } from './ToolInputPreviewContext';
import type { ToolMessagePart } from './toolPartState';

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
  const scroll = useRef<ScrollView>(null);
  const followsContent = useRef(true);
  const { t } = useTranslation();
  if (!content) return null;

  const markdown =
    content.variant === 'code'
      ? createCodeBlockMarkdown(content.text, content.language, content.isStreaming)
      : content.text;

  return (
    <View className="gap-1" testID="file-tool-content">
      {content.name ? (
        <Text className="font-mono text-muted-foreground text-xs" numberOfLines={1}>
          {content.name}
        </Text>
      ) : null}
      {content.truncated ? (
        <Text className="text-muted-foreground text-xs">
          {t('chat.builtinTool.file.latestContent')}
        </Text>
      ) : null}
      <ScrollView
        className="max-h-64"
        nestedScrollEnabled
        onContentSizeChange={() => {
          if (content.isStreaming && followsContent.current)
            scroll.current?.scrollToEnd({ animated: false });
        }}
        onScrollBeginDrag={() => {
          followsContent.current = false;
        }}
        ref={scroll}
        showsVerticalScrollIndicator
        testID="file-tool-content-scroll"
      >
        {content.variant === 'text' ? (
          <Text className="text-foreground text-sm" selectable={!content.isStreaming}>
            {content.text}
          </Text>
        ) : (
          <MarkdownText
            isStreaming={content.isStreaming}
            markdown={markdown}
            selectable={!content.isStreaming}
          />
        )}
      </ScrollView>
    </View>
  );
}
