import { Button, Image, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import { createCodeBlockMarkdown } from '@/frontend/utils/createCodeBlockMarkdown';

import { SourceLink } from '../SourceLink';
import {
  createToolResultPreview,
  formatToolResultJson,
  getToolResultCopyText,
  TOOL_RESULT_PREVIEW_LIMIT,
  type ToolResultContent,
} from './toolResultContent';

type ToolResultContentRendererProps = {
  contents: readonly ToolResultContent[];
  imageAccessibilityLabel: string;
};

export function ToolResultContentRenderer({
  contents,
  imageAccessibilityLabel,
}: ToolResultContentRendererProps) {
  const preview = createToolResultPreview(contents);

  return (
    <View className="gap-2">
      {preview.contents.map((content, index) => (
        <ToolResultContentItem
          content={content}
          imageAccessibilityLabel={imageAccessibilityLabel}
          key={createContentKey(content, index)}
        />
      ))}
      {preview.isTruncated ? <ToolResultOverflow contents={contents} /> : null}
    </View>
  );
}

function ToolResultOverflow({ contents }: { contents: readonly ToolResultContent[] }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const copy = async () => {
    try {
      await Clipboard.setStringAsync(getToolResultCopyText(contents));
      toast.show({ label: t('chat.tool.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('chat.tool.copyFailed'), variant: 'danger' });
    }
  };

  return (
    <View className="items-start gap-1">
      <Text className="text-muted-foreground text-xs">
        {t('chat.tool.previewTruncated', { count: TOOL_RESULT_PREVIEW_LIMIT })}
      </Text>
      <Button
        onPress={() => void copy()}
        size="sm"
        testID="tool-result-copy-full-text"
        variant="ghost"
      >
        {t('chat.tool.copyFullText')}
      </Button>
    </View>
  );
}

function ToolResultContentItem({
  content,
  imageAccessibilityLabel,
}: {
  content: ToolResultContent;
  imageAccessibilityLabel: string;
}) {
  switch (content.kind) {
    case 'audio':
    case 'resource':
      return <SelectableText value={content.fallbackText} />;
    case 'code':
      return <CodeContent content={content.content} language={content.language} />;
    case 'image':
      return (
        <Image
          accessibilityLabel={imageAccessibilityLabel}
          className="h-44 w-full rounded-md"
          contentFit="contain"
          source={`data:${content.mimeType};base64,${content.data}`}
        />
      );
    case 'json':
      return <CodeContent content={formatToolResultJson(content.value)} language="json" />;
    case 'markdown':
      return <MarkdownText markdown={content.content} selectable={false} />;
    case 'resource-link':
      return isExternalResourceUri(content.uri) ? (
        <SourceLink label={content.label} url={content.uri} variant="listItem" />
      ) : (
        <SelectableText value={content.label} />
      );
    case 'text':
      return <SelectableText value={content.content} />;
  }
}

function CodeContent({ content, language }: { content: string; language?: string }) {
  return <MarkdownText markdown={createCodeBlockMarkdown(content, language)} selectable={false} />;
}

function SelectableText({ value }: { value: string }) {
  return (
    <Text className="text-base text-foreground" selectable>
      {value}
    </Text>
  );
}

function isExternalResourceUri(uri: string) {
  return /^https?:\/\//i.test(uri.trim());
}

function createContentKey(content: ToolResultContent, index: number) {
  const value = contentKeyValue(content);
  let hash = 0;
  const sample = `${value.length}:${value.slice(0, 64)}`;
  for (const character of sample) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return `tool-result-${content.kind}-${index}-${hash}`;
}

function contentKeyValue(content: ToolResultContent) {
  switch (content.kind) {
    case 'audio':
    case 'resource':
      return content.fallbackText;
    case 'code':
    case 'markdown':
    case 'text':
      return content.content;
    case 'image':
      return content.data;
    case 'json':
      return formatToolResultJson(content.value);
    case 'resource-link':
      return content.uri;
  }
}
