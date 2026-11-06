import { Image, MessagePart } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import { MessageDetailSection, MessageDetailText } from '@/frontend/components/MessageDetail';

import { SourceLink } from '../SourceLink';
import {
  formatToolResultJson,
  getToolResultCopyText,
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
  const single = contents.length === 1 ? contents[0] : undefined;
  if (single?.kind === 'code' || single?.kind === 'json') {
    return (
      <MessageDetailText
        copyTestID="tool-result-copy-full-text"
        language={single.kind === 'json' ? 'json' : single.language}
        title={title}
        tone={tone}
        value={single.kind === 'json' ? formatToolResultJson(single.value) : single.content}
        variant="code"
      />
    );
  }

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
        {contents.map((content, index) => (
          <ToolResultContentItem
            content={content}
            imageAccessibilityLabel={imageAccessibilityLabel}
            renderResourceLink={renderResourceLink}
            key={createContentKey(content, index)}
          />
        ))}
      </View>
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
      return <MessagePart.TextBody value={content.fallbackText} />;
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
      return <MarkdownText markdown={content.content} />;
    case 'resource-link':
      if (renderResourceLink) return renderResourceLink(content);
      return isExternalResourceUri(content.uri) ? (
        <SourceLink label={content.label} url={content.uri} variant="listItem" />
      ) : (
        <MessagePart.TextBody value={content.label} />
      );
    case 'text':
      return <MessagePart.TextBody value={content.content} />;
  }
}

function CodeContent({ content, language }: { content: string; language?: string }) {
  const { t } = useTranslation();
  return (
    <MessageDetailText
      language={language}
      title={t('chat.tool.code')}
      value={content}
      variant="code"
    />
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
