import { MarkdownText as CherryMarkdownText } from '@cherrystudio/ui/components';
import { normalizeFontSizeStep } from '@cherrystudio/ui/utils';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data/hooks';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { FontSizeStep } from '@/shared/data/preference';

import { resolveCitationLinkUrl } from '../citationLink';

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
  const { t } = useTranslation();
  // The renderer presents its own copy menus natively, so it needs the labels up
  // front rather than reporting a press back to product code.
  const selectionMenuLabels = useMemo(
    () => ({ copy: t('common.copy'), copyAsMarkdown: t('common.copyAsMarkdown') }),
    [t],
  );

  return (
    <CherryMarkdownText
      fontSizeStep={normalizeFontSizeStep(fontSizeStep ?? storedFontSizeStep)}
      isStreaming={isStreaming}
      markdown={markdown}
      onLinkPress={handleLinkPress}
      selectable={selectable}
      selectionMenuLabels={selectionMenuLabels}
    />
  );
}

function handleLinkPress(url: string) {
  void openExternalUrl(resolveCitationLinkUrl(url) ?? url);
}
