import { MarkdownText } from '@/frontend/components/MarkdownText';

type PartMarkdownProps = {
  isStreaming: boolean;
  markdown: string;
};

/** Message Markdown is always selectable; the text region owns its own touches. */
export function PartMarkdown({ isStreaming, markdown }: PartMarkdownProps) {
  return <MarkdownText isStreaming={isStreaming} markdown={markdown} />;
}
