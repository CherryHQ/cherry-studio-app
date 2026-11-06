import { useMemo, useState } from 'react';

import { MarkdownText } from '@/frontend/components/MarkdownText';

import { useMessageListLiveTailVisible } from '../list/MessageListLiveTailContext';
import { useMessageSelectionAction } from './MessageSelectionActionContext';

type PartMarkdownProps = {
  isStreaming: boolean;
  markdown: string;
  messageId?: string;
};

/**
 * Message Markdown is always selectable; the text region owns its own touches.
 *
 * A streaming part grows at the list's end. While that end is off screen, the
 * native renderer keeps the last shown text instead of re-parsing and re-laying
 * out the whole part for content nobody can see; it catches up when the end
 * comes back into view or the part finishes.
 */
export function PartMarkdown({ isStreaming, markdown, messageId }: PartMarkdownProps) {
  const isLiveTailVisible = useMessageListLiveTailVisible(isStreaming);
  const action = useMessageSelectionAction();
  const selectionAction = useMemo(
    () =>
      action && messageId
        ? { label: action.label, onPress: (text: string) => action.onPress({ messageId, text }) }
        : undefined,
    [action, messageId],
  );
  const [shownMarkdown, setShownMarkdown] = useState(markdown);
  const isHeld = isStreaming && !isLiveTailVisible;
  if (!isHeld && shownMarkdown !== markdown) {
    setShownMarkdown(markdown);
  }

  return (
    <MarkdownText
      isStreaming={isStreaming}
      markdown={isHeld ? shownMarkdown : markdown}
      selectionAction={selectionAction}
    />
  );
}
