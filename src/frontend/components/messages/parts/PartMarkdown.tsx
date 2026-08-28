import { MarkdownText } from '@/frontend/components/markdown';

type PartMarkdownProps = {
  isStreaming: boolean;
  markdown: string;
  selectable: boolean;
};

export function PartMarkdown({ isStreaming, markdown, selectable }: PartMarkdownProps) {
  return <MarkdownText isStreaming={isStreaming} markdown={markdown} selectable={selectable} />;
}
