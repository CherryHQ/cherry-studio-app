import type { FontSizeStep } from '@cherrystudio/universal/data/preference';
import { useMemo } from 'react';
import {
  EnrichedMarkdownText,
  type LinkPressEvent,
  type MarkdownStyle,
} from 'react-native-enriched-markdown';
import { StreamdownText } from 'react-native-streamdown';

import { usePreference } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { monoFontFamily } from '@/frontend/utils/constants';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { resolveTypographyScale } from '@/frontend/utils/typographyScale';

type MarkdownTextProps = {
  fontSizeStep?: FontSizeStep;
  isStreaming?: boolean;
  markdown: string;
};

function handleLinkPress({ url }: LinkPressEvent) {
  void openExternalUrl(url);
}

function createMarkdownTypographyStyle(fontSizeStep: FontSizeStep): MarkdownStyle {
  const scale = resolveTypographyScale(fontSizeStep);

  return {
    paragraph: scale.base,
    h1: scale['2xl'],
    h2: scale.xl,
    h3: scale.lg,
    h4: scale.base,
    h5: scale.base,
    h6: scale.sm,
    blockquote: scale.base,
    list: scale.base,
    // Code is styled through RN style objects rather than `className`, so it
    // cannot pick up the `font-mono` utility and needs the family named here.
    code: { fontFamily: monoFontFamily },
    codeBlock: { ...scale.sm, fontFamily: monoFontFamily },
    table: scale.sm,
    math: { fontSize: scale.xl.fontSize },
  };
}

export function MarkdownText({ fontSizeStep, isStreaming = false, markdown }: MarkdownTextProps) {
  const [storedFontSizeStep] = usePreference('ui.font_size_step');
  const [
    foreground,
    background,
    mutedForeground,
    link,
    primary,
    border,
    secondary,
    codeBlock,
    inlineCode,
    inlineCodeForeground,
  ] = useThemeColor([
    'foreground',
    'background',
    'muted-foreground',
    'link',
    'primary',
    'border',
    'secondary',
    'code-block',
    'inline-code',
    'inline-code-foreground',
  ]);
  const resolvedStep = fontSizeStep ?? storedFontSizeStep;
  const MarkdownRenderer = isStreaming ? StreamdownText : EnrichedMarkdownText;

  // Applied to both themes. This used to short-circuit to bare typography in
  // light mode, which left the renderer on its own built-in palette — so light
  // mode never saw the token layer at all. `useThemeColor` already resolves per
  // active theme, so one style object covers both.
  const markdownStyle = useMemo<MarkdownStyle>(() => {
    const typography = createMarkdownTypographyStyle(resolvedStep);

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
      code: {
        ...typography.code,
        backgroundColor: inlineCode,
        borderColor: border,
        color: inlineCodeForeground,
      },
      codeBlock: {
        ...typography.codeBlock,
        backgroundColor: codeBlock,
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
    codeBlock,
    foreground,
    inlineCode,
    inlineCodeForeground,
    link,
    mutedForeground,
    primary,
    resolvedStep,
    secondary,
  ]);

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
