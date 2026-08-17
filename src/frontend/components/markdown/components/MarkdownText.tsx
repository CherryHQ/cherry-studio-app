import { MarkdownText as CherryMarkdownText } from '@cherrystudio/ui/components';
import { normalizeFontSizeStep } from '@cherrystudio/ui/utils';
import type { FontSizeStep } from '@cherrystudio/universal/data/preference';

import { usePreference } from '@/frontend/data/hooks';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

type MarkdownTextProps = {
  fontSizeStep?: FontSizeStep;
  isStreaming?: boolean;
  markdown: string;
};

export function MarkdownText({ fontSizeStep, isStreaming = false, markdown }: MarkdownTextProps) {
  const [storedFontSizeStep] = usePreference('ui.font_size_step');

  return (
    <CherryMarkdownText
      fontSizeStep={normalizeFontSizeStep(fontSizeStep ?? storedFontSizeStep)}
      isStreaming={isStreaming}
      markdown={markdown}
      onLinkPress={handleLinkPress}
    />
  );
}

function handleLinkPress(url: string) {
  void openExternalUrl(url);
}
