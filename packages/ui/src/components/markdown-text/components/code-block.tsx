import CopyIcon from '@cherrystudio/app-icons/icons/copy';

import { createCodeBlockMarkdown } from '../../../markdown';
import type { TypographySizeStep } from '../../../utils/typography-scale';
import { Button } from '../../button';
import { MessagePartSection } from '../../message-part/components/message-part-sections';
import type { MessagePartSectionTitleProps } from '../../message-part/message-part.types';
import { MarkdownContent } from './markdown-text';

export type CodeBlockProps = MessagePartSectionTitleProps & {
  code: string;
  copyLabel: string;
  copyTestID?: string;
  fontSizeStep: TypographySizeStep;
  language?: string;
  onCopy: (code: string) => void;
};

/** One source for scrolling and copying; native layout owns the complete code viewport. */
export function CodeBlock({
  code,
  copyLabel,
  copyTestID,
  fontSizeStep,
  language,
  onCopy,
  title,
  tone,
}: CodeBlockProps) {
  return (
    <MessagePartSection
      title={title}
      tone={tone}
      action={
        <Button
          accessibilityHint={title}
          accessibilityLabel={copyLabel}
          icon={<CopyIcon className="text-muted-foreground" />}
          onPress={() => onCopy(code)}
          size="sm"
          testID={copyTestID}
          variant="ghost"
        />
      }
    >
      <MarkdownContent
        externalCodeBlockControls
        fontSizeStep={fontSizeStep}
        markdown={createCodeBlockMarkdown(code, language)}
        onLinkPress={ignoreLink}
      />
    </MessagePartSection>
  );
}

// A fenced source has no navigable links.
function ignoreLink() {}
