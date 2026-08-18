import { useMemo } from 'react';
import {
  EnrichedMarkdownText,
  type LinkPressEvent,
  type MarkdownStyle,
} from 'react-native-enriched-markdown';
import { StreamdownText } from 'react-native-streamdown';
import { useCSSVariable, useUniwind } from 'uniwind';

import { resolveTypographyScale, type TypographySizeStep } from '../../../utils/typography-scale';
import { resolveSyntaxColors } from '../utils/syntax-colors';

const markdownThemeVariables = [
  '--color-foreground',
  '--color-background',
  '--color-muted-foreground',
  '--color-link',
  '--color-border',
  '--color-secondary',
  '--color-code-block',
  '--color-inline-code',
  '--color-inline-code-foreground',
  '--font-mono',
];

export type MarkdownTextProps = {
  fontSizeStep: TypographySizeStep;
  isStreaming?: boolean;
  markdown: string;
  onLinkPress: (url: string) => void;
};

function createMarkdownTypographyStyle(
  fontSizeStep: TypographySizeStep,
  monoFontFamily: string,
): MarkdownStyle {
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
    code: { fontFamily: monoFontFamily },
    codeBlock: { ...scale.sm, fontFamily: monoFontFamily },
    table: scale.sm,
    math: {
      fontSize: scale.base.fontSize,
      marginBottom: 8,
      marginTop: 4,
      padding: 4,
      textAlign: 'center',
    },
  };
}

export function MarkdownText({
  fontSizeStep,
  isStreaming = false,
  markdown,
  onLinkPress,
}: MarkdownTextProps) {
  const { theme } = useUniwind();
  const [
    foregroundValue,
    backgroundValue,
    mutedForegroundValue,
    linkValue,
    borderValue,
    secondaryValue,
    codeBlockValue,
    inlineCodeValue,
    inlineCodeForegroundValue,
    monoFontFamilyValue,
  ] = useCSSVariable(markdownThemeVariables);
  const foreground = resolveCSSString(foregroundValue);
  const background = resolveCSSString(backgroundValue);
  const mutedForeground = resolveCSSString(mutedForegroundValue);
  const link = resolveCSSString(linkValue);
  const border = resolveCSSString(borderValue);
  const secondary = resolveCSSString(secondaryValue);
  const codeBlock = resolveCSSString(codeBlockValue);
  const inlineCode = resolveCSSString(inlineCodeValue);
  const inlineCodeForeground = resolveCSSString(inlineCodeForegroundValue);
  const monoFontFamily = resolveCSSString(monoFontFamilyValue, 'GeistMono-Regular');
  const MarkdownRenderer = isStreaming ? StreamdownText : EnrichedMarkdownText;
  const handleLinkPress = ({ url }: LinkPressEvent) => onLinkPress(url);
  const markdownStyle = useMemo<MarkdownStyle>(() => {
    const typography = createMarkdownTypographyStyle(fontSizeStep, monoFontFamily);

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
        syntaxColors: resolveSyntaxColors(theme, mutedForeground),
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
        checkedColor: foreground,
        checkedTextColor: mutedForeground,
        checkmarkColor: foreground,
      },
      math: { ...typography.math, backgroundColor: background, color: foreground },
      inlineMath: { color: foreground },
      spoiler: { color: foreground },
    };
  }, [
    background,
    border,
    codeBlock,
    fontSizeStep,
    foreground,
    inlineCode,
    inlineCodeForeground,
    link,
    monoFontFamily,
    mutedForeground,
    secondary,
    theme,
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

function resolveCSSString(value: number | string | undefined, fallback = 'invalid'): string {
  return typeof value === 'string' ? value : fallback;
}
