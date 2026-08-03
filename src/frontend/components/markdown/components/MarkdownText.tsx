import type { FontSizeStep } from '@cherrystudio/universal/data/preference';
import { useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import {
  EnrichedMarkdownText,
  type LinkPressEvent,
  type MarkdownStyle,
} from 'react-native-enriched-markdown';
import { StreamdownText } from 'react-native-streamdown';

import { usePreference } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { normalizeFontSizeStep } from '@/frontend/utils/typographyScale';

import { createMarkdownTypographyStyle } from '../utils/markdownTypography';

type MarkdownTextProps = {
  fontSizeStep?: FontSizeStep;
  isStreaming?: boolean;
  markdown: string;
};

export function MarkdownText({ fontSizeStep, isStreaming = false, markdown }: MarkdownTextProps) {
  const [storedFontSizeStep] = usePreference('ui.font_size_step');
  const colorScheme = useColorScheme();
  const [foreground, background, mutedForeground, link, primary, border, secondary] = useThemeColor(
    ['foreground', 'background', 'muted-foreground', 'link', 'primary', 'border', 'secondary'],
  );
  const resolvedStep = normalizeFontSizeStep(fontSizeStep ?? storedFontSizeStep);
  const MarkdownRenderer = isStreaming ? StreamdownText : EnrichedMarkdownText;

  const markdownStyle = useMemo<MarkdownStyle>(() => {
    const typography = createMarkdownTypographyStyle(resolvedStep);

    if (colorScheme !== 'dark') {
      return typography;
    }

    return {
      ...typography,
      paragraph: { ...typography.paragraph, color: foreground },
      h1: { ...typography.h1, color: foreground },
      h2: { ...typography.h2, color: foreground },
      h3: { ...typography.h3, color: foreground },
      h4: { ...typography.h4, color: foreground },
      h5: { ...typography.h5, color: foreground },
      h6: { ...typography.h6, color: foreground },
      blockquote: {
        ...typography.blockquote,
        backgroundColor: background,
        borderColor: mutedForeground,
        color: mutedForeground,
      },
      list: {
        ...typography.list,
        bulletColor: foreground,
        color: foreground,
        markerColor: foreground,
      },
      code: { backgroundColor: secondary, borderColor: border, color: foreground },
      codeBlock: {
        ...typography.codeBlock,
        backgroundColor: secondary,
        borderColor: border,
        color: foreground,
      },
      link: { color: link },
      strong: { color: foreground },
      em: { color: foreground },
      strikethrough: { color: mutedForeground },
      underline: { color: foreground },
      thematicBreak: { color: mutedForeground },
      table: {
        ...typography.table,
        borderColor: border,
        color: foreground,
        headerBackgroundColor: secondary,
        headerTextColor: foreground,
        rowEvenBackgroundColor: background,
        rowOddBackgroundColor: background,
      },
      taskList: {
        borderColor: mutedForeground,
        checkedColor: primary,
        checkedTextColor: mutedForeground,
        checkmarkColor: foreground,
      },
      math: {
        ...typography.math,
        backgroundColor: secondary,
        color: foreground,
      },
      inlineMath: { color: foreground },
      spoiler: { color: foreground },
    };
  }, [
    background,
    border,
    colorScheme,
    foreground,
    link,
    mutedForeground,
    primary,
    resolvedStep,
    secondary,
  ]);

  const handleLinkPress = useCallback(({ url }: LinkPressEvent) => {
    void openExternalUrl(url);
  }, []);

  return (
    <MarkdownRenderer
      allowTrailingMargin={false}
      flavor="github"
      markdown={markdown}
      markdownStyle={markdownStyle}
      md4cFlags={{ latexMath: true, underline: false }}
      onLinkPress={handleLinkPress}
      selectable
    />
  );
}
