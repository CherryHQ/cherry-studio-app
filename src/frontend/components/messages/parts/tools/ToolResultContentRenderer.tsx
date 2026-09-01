import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { MarkdownText } from '@/frontend/components/markdown';
import { createCodeBlockMarkdown } from '@/frontend/utils/createCodeBlockMarkdown';

import { SourceLink } from '../SourceLink';
import { formatToolResultJson, type ToolResultContent } from './toolResultContent';

type ToolResultContentRendererProps = {
  contents: readonly ToolResultContent[];
  imageAccessibilityLabel: string;
};

export function ToolResultContentRenderer({
  contents,
  imageAccessibilityLabel,
}: ToolResultContentRendererProps) {
  return (
    <View className="gap-2">
      {contents.map((content, index) => (
        <ToolResultContentItem
          content={content}
          imageAccessibilityLabel={imageAccessibilityLabel}
          key={createContentKey(content, index)}
        />
      ))}
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
