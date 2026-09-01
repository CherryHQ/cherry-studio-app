import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { MarkdownText } from '@/frontend/components/markdown';
import { createCodeBlockMarkdown } from '@/frontend/utils/createCodeBlockMarkdown';

import { SourceLink } from '../SourceLink';
import {
  formatToolResultJson,
  truncateToolResultText,
  type ToolResultContent,
} from './toolResultContent';

const DEFAULT_MAX_TEXT_LENGTH = 4000;

type ToolResultContentRendererProps = {
  contents: readonly ToolResultContent[];
  getTruncatedText: (characterCount: number) => string;
  imageAccessibilityLabel: string;
  maxTextLength?: number;
};

export function ToolResultContentRenderer({
  contents,
  getTruncatedText,
  imageAccessibilityLabel,
  maxTextLength = DEFAULT_MAX_TEXT_LENGTH,
}: ToolResultContentRendererProps) {
  return (
    <View className="gap-2">
      {contents.map((content, index) => (
        <ToolResultContentItem
          content={content}
          getTruncatedText={getTruncatedText}
          imageAccessibilityLabel={imageAccessibilityLabel}
          key={createContentKey(content, index)}
          maxTextLength={maxTextLength}
        />
      ))}
    </View>
  );
}

function ToolResultContentItem({
  content,
  getTruncatedText,
  imageAccessibilityLabel,
  maxTextLength,
}: {
  content: ToolResultContent;
  getTruncatedText: (characterCount: number) => string;
  imageAccessibilityLabel: string;
  maxTextLength: number;
}) {
  switch (content.kind) {
    case 'audio':
    case 'resource':
      return <SelectableText value={content.fallbackText} />;
    case 'code':
      return (
        <CodeContent
          content={content.content}
          getTruncatedText={getTruncatedText}
          language={content.language}
          maxTextLength={maxTextLength}
        />
      );
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
      return (
        <CodeContent
          content={formatToolResultJson(content.value)}
          getTruncatedText={getTruncatedText}
          language="json"
          maxTextLength={maxTextLength}
        />
      );
    case 'markdown': {
      const markdown = truncateToolResultText(content.content, maxTextLength, getTruncatedText);
      return <MarkdownText markdown={markdown} selectable={false} />;
    }
    case 'resource-link':
      return isExternalResourceUri(content.uri) ? (
        <SourceLink label={content.label} url={content.uri} variant="listItem" />
      ) : (
        <SelectableText value={content.label} />
      );
    case 'text':
      return (
        <SelectableText
          value={truncateToolResultText(content.content, maxTextLength, getTruncatedText)}
        />
      );
  }
}

function CodeContent({
  content,
  getTruncatedText,
  language,
  maxTextLength,
}: {
  content: string;
  getTruncatedText: (characterCount: number) => string;
  language?: string;
  maxTextLength: number;
}) {
  const truncatedContent = truncateToolResultText(content, maxTextLength, getTruncatedText);
  return (
    <MarkdownText
      markdown={createCodeBlockMarkdown(truncatedContent, language)}
      selectable={false}
    />
  );
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
