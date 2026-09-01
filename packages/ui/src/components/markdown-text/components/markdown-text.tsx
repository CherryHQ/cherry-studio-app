import { useMemo, useState } from 'react';
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
  '--color-primary',
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
  selectable?: boolean;
};

function createMarkdownTypographyStyle(
  fontSizeStep: TypographySizeStep,
  monoFontFamily: string,
): MarkdownStyle {
  const scale = resolveTypographyScale(fontSizeStep);

  return {
    paragraph: { ...scale.base, marginBottom: 12, marginTop: 0 },
    h1: { ...scale['2xl'], fontWeight: '600', marginBottom: 10, marginTop: 18 },
    h2: { ...scale.xl, fontWeight: '600', marginBottom: 8, marginTop: 18 },
    h3: { ...scale.lg, fontWeight: '600', marginBottom: 8, marginTop: 16 },
    h4: { ...scale.base, fontWeight: '600', marginBottom: 6, marginTop: 14 },
    h5: { ...scale.base, fontWeight: '600', marginBottom: 6, marginTop: 14 },
    h6: { ...scale.sm, fontWeight: '600', marginBottom: 6, marginTop: 14 },
    blockquote: {
      ...scale.base,
      borderRadius: 8,
      borderWidth: 2,
      gapWidth: 10,
      marginBottom: 12,
      marginTop: 4,
      padding: 12,
    },
    list: {
      ...scale.base,
      bulletSize: 5,
      gapWidth: 8,
      itemSpacing: 4,
      marginBottom: 12,
      marginLeft: 20,
      marginTop: 0,
      markerFontWeight: '500',
    },
    code: { fontFamily: monoFontFamily, fontSize: scale.sm.fontSize },
    codeBlock: {
      ...scale.sm,
      borderRadius: 10,
      borderWidth: 1,
      fontFamily: monoFontFamily,
      marginBottom: 14,
      marginTop: 4,
      padding: 12,
    },
    table: {
      ...scale.sm,
      borderRadius: 10,
      borderWidth: 1,
      cellPaddingHorizontal: 10,
      cellPaddingVertical: 8,
      marginBottom: 14,
      marginTop: 4,
    },
    math: {
      fontSize: scale.base.fontSize,
      marginBottom: 14,
      marginTop: 4,
      padding: 12,
      textAlign: 'center',
    },
  };
}

export function MarkdownText({
  fontSizeStep,
  isStreaming = false,
  markdown,
  onLinkPress,
  selectable = true,
}: MarkdownTextProps) {
  const { theme } = useUniwind();
  const [
    foregroundValue,
    backgroundValue,
    primaryValue,
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
  const primary = resolveCSSString(primaryValue);
  const mutedForeground = resolveCSSString(mutedForegroundValue);
  const link = resolveCSSString(linkValue);
  const border = resolveCSSString(borderValue);
  const secondary = resolveCSSString(secondaryValue);
  const codeBlock = resolveCSSString(codeBlockValue);
  const inlineCode = resolveCSSString(inlineCodeValue);
  const inlineCodeForeground = resolveCSSString(inlineCodeForegroundValue);
  const monoFontFamily = resolveCSSString(monoFontFamilyValue, 'GeistMono-Regular');
  const [hasStreamed, setHasStreamed] = useState(isStreaming);
  if (isStreaming && !hasStreamed) {
    setHasStreamed(true);
  }
  // A streamed part keeps one native renderer for its full lifetime. Switching
  // component types at terminal status remounts the whole Markdown subtree and
  // invalidates the list's measured height and native selection state.
  const MarkdownRenderer = isStreaming || hasStreamed ? StreamdownText : EnrichedMarkdownText;
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
        backgroundColor: secondary,
        borderColor: primary,
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
      link: { color: link, underline: true },
      strong: { color: foreground },
      em: { color: foreground },
      strikethrough: { color: mutedForeground },
      underline: { color: foreground },
      image: {
        borderRadius: 10,
        marginBottom: 14,
        marginTop: 4,
        maxHeight: 320,
        resizeMode: 'contain',
      },
      thematicBreak: { color: border, height: 1, marginBottom: 20, marginTop: 20 },
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
        checkboxBorderRadius: 4,
        checkboxSize: 16,
      },
      math: { ...typography.math, backgroundColor: codeBlock, color: foreground },
      inlineMath: { color: foreground },
      highlight: { backgroundColor: secondary, color: foreground },
      spoiler: { color: mutedForeground, solid: { borderRadius: 4 } },
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
    primary,
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
      selectable={selectable}
    />
  );
}

function resolveCSSString(value: number | string | undefined, fallback = 'invalid'): string {
  return typeof value === 'string' ? value : fallback;
}
