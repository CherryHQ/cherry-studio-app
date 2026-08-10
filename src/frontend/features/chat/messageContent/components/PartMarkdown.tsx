import { MarkdownText } from '@/frontend/components/markdown';

type PartMarkdownProps = {
  isStreaming: boolean;
  markdown: string;
};

export function PartMarkdown({ isStreaming, markdown }: PartMarkdownProps) {
  return <MarkdownText isStreaming={isStreaming} markdown={markdown} />;
}
