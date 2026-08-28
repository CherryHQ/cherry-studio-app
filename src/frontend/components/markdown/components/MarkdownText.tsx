import { MarkdownText as CherryMarkdownText } from '@cherrystudio/ui/components';
import { normalizeFontSizeStep } from '@cherrystudio/ui/utils';

import { usePreference } from '@/frontend/data/hooks';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { FontSizeStep } from '@/shared/data/preference';

type MarkdownTextProps = {
  fontSizeStep?: FontSizeStep;
  isStreaming?: boolean;
  markdown: string;
  selectable?: boolean;
};

export function MarkdownText({
  fontSizeStep,
  isStreaming = false,
  markdown,
  selectable = true,
}: MarkdownTextProps) {
  const [storedFontSizeStep] = usePreference('ui.font_size_step');

  return (
    <CherryMarkdownText
      fontSizeStep={normalizeFontSizeStep(fontSizeStep ?? storedFontSizeStep)}
      isStreaming={isStreaming}
      markdown={markdown}
      onLinkPress={handleLinkPress}
      selectable={selectable}
    />
  );
}

function handleLinkPress(url: string) {
  void openExternalUrl(url);
}
