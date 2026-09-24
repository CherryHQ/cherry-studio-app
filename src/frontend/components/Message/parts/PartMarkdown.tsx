import { useState } from 'react';

import { MarkdownText } from '@/frontend/components/MarkdownText';

import { useMessageListLiveTailVisible } from '../list/MessageListLiveTailContext';

type PartMarkdownProps = {
  isStreaming: boolean;
  markdown: string;
};

/**
 * Message Markdown is always selectable; the text region owns its own touches.
 *
 * A streaming part grows at the list's end. While that end is off screen, the
 * native renderer keeps the last shown text instead of re-parsing and re-laying
 * out the whole part for content nobody can see; it catches up when the end
 * comes back into view or the part finishes.
 */
export function PartMarkdown({ isStreaming, markdown }: PartMarkdownProps) {
  const isLiveTailVisible = useMessageListLiveTailVisible();
  const [shownMarkdown, setShownMarkdown] = useState(markdown);
  const isHeld = isStreaming && !isLiveTailVisible;
  if (!isHeld && shownMarkdown !== markdown) {
    setShownMarkdown(markdown);
  }

  return <MarkdownText isStreaming={isStreaming} markdown={isHeld ? shownMarkdown : markdown} />;
}
