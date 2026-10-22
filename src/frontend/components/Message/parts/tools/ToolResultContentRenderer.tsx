import { Image, MessagePart } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import { MessageDetailSection } from '@/frontend/components/MessageDetail';
import { createCodeBlockMarkdown } from '@/shared/utils/createCodeBlockMarkdown';

import { SourceLink } from '../SourceLink';
import {
  createToolResultPreview,
  formatToolResultJson,
  getToolResultCopyText,
  TOOL_RESULT_PREVIEW_LIMIT,
  type ToolResultContent,
} from './toolResultContent';

type ToolResultContentRendererProps = {
  title: string;
  tone?: 'danger';
  contents: readonly ToolResultContent[];
  imageAccessibilityLabel: string;
  renderResourceLink?: (
    content: Extract<ToolResultContent, { kind: 'resource-link' }>,
  ) => ReactNode;
};

export function ToolResultContentRenderer({
  title,
  tone,
  contents,
  imageAccessibilityLabel,
  renderResourceLink,
}: ToolResultContentRendererProps) {
  const preview = createToolResultPreview(contents);
  const { t } = useTranslation();

  return (
    <MessageDetailSection
      title={title}
      tone={tone}
      copyText={
        contents.some((content) => content.kind !== 'image')
          ? () => getToolResultCopyText(contents)
          : undefined
      }
      copyTestID="tool-result-copy-full-text"
    >
      <View className="gap-4">
        {preview.contents.map((content, index) => (
          <ToolResultContentItem
            content={content}
            imageAccessibilityLabel={imageAccessibilityLabel}
            renderResourceLink={renderResourceLink}
            key={createContentKey(content, index)}
          />
        ))}
      </View>
      {preview.isTruncated ? (
        <Text className="text-muted-foreground text-xs">
          {t('chat.tool.previewTruncated', { count: TOOL_RESULT_PREVIEW_LIMIT })}
        </Text>
      ) : null}
    </MessageDetailSection>
  );
}

function ToolResultContentItem({
  content,
  imageAccessibilityLabel,
  renderResourceLink,
}: {
  content: ToolResultContent;
  imageAccessibilityLabel: string;
  renderResourceLink?: ToolResultContentRendererProps['renderResourceLink'];
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
      if (renderResourceLink) return renderResourceLink(content);
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
    <MessagePart.SectionBody>
      <Text className="text-base text-foreground" selectable>
        {value}
      </Text>
    </MessagePart.SectionBody>
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
