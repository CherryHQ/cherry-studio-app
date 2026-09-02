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
  '--color-foreground-tertiary',
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

/**
 * Block spacing lives entirely in `marginBottom`. iOS collapses adjacent block
 * margins while Android sums them, so a block that also set `marginTop` would
 * render a different rhythm per platform; bottom-only spacing is identical on
 * both and keeps a message that opens with a heading from starting with a gap.
 */
function createMarkdownTypographyStyle(
  fontSizeStep: TypographySizeStep,
  monoFontFamily: string,
): MarkdownStyle {
  const scale = resolveTypographyScale(fontSizeStep);
  const prose = { ...scale.base, lineHeight: scale.base.lineHeight + 2 };

  return {
    paragraph: { ...prose, marginBottom: 12, marginTop: 0 },
    h1: { ...scale.xl, fontWeight: '700', marginBottom: 10, marginTop: 0 },
    h2: { ...scale.lg, fontWeight: '600', marginBottom: 8, marginTop: 0 },
    h3: { ...scale.base, fontWeight: '600', marginBottom: 8, marginTop: 0 },
    h4: { ...scale.base, fontWeight: '600', marginBottom: 6, marginTop: 0 },
    h5: { ...scale.base, fontWeight: '600', marginBottom: 6, marginTop: 0 },
    h6: { ...scale.sm, fontWeight: '600', marginBottom: 6, marginTop: 0 },
    blockquote: {
      ...prose,
      borderRadius: 0,
      borderWidth: 3,
      gapWidth: 12,
      marginBottom: 12,
      marginTop: 0,
      padding: 2,
    },
    list: {
      ...prose,
      bulletSize: 6,
      gapWidth: 10,
      itemSpacing: 6,
      marginBottom: 12,
      marginLeft: 8,
      marginTop: 0,
      markerFontWeight: '500',
      // Floors every marker column to the width an ordered list reserves for
      // "99." so bullet, number and task items all start their text on the
      // same edge instead of bullets hugging the paragraph margin.
      markerMinWidth: Math.ceil(scale.base.fontSize * 1.5),
    },
    code: { fontFamily: monoFontFamily, fontSize: scale.sm.fontSize },
    codeBlock: {
      ...scale.sm,
      borderRadius: 12,
      borderWidth: 0,
      fontFamily: monoFontFamily,
      marginBottom: 12,
      marginTop: 0,
      padding: 14,
    },
    table: {
      ...scale.sm,
      borderRadius: 12,
      borderWidth: 1,
      cellPaddingHorizontal: 12,
      cellPaddingVertical: 9,
      marginBottom: 12,
      marginTop: 0,
    },
    math: {
      fontSize: scale.base.fontSize,
      marginBottom: 12,
      marginTop: 0,
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
    foregroundTertiaryValue,
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
  const foregroundTertiary = resolveCSSString(foregroundTertiaryValue);
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
        backgroundColor: 'transparent',
        borderColor: border,
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
        borderColor: inlineCode,
        color: inlineCodeForeground,
      },
      codeBlock: {
        ...typography.codeBlock,
        backgroundColor: codeBlock,
        borderColor: border,
        color: foreground,
        syntaxColors: resolveSyntaxColors(theme, mutedForeground),
      },
      link: { color: link, underline: false },
      linkVariants: {
        '^cite:': { backgroundColor: secondary, color: foregroundTertiary, underline: false },
      },
      strong: { color: foreground },
      em: { color: foreground },
      strikethrough: { color: mutedForeground },
      underline: { color: foreground },
      image: {
        borderRadius: 12,
        marginBottom: 12,
        marginTop: 0,
        maxHeight: 320,
        resizeMode: 'contain',
      },
      thematicBreak: { color: border, height: 1, marginBottom: 12, marginTop: 0 },
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
        checkmarkColor: background,
        checkboxBorderRadius: 4,
        checkboxSize: 16,
      },
      math: { ...typography.math, backgroundColor: 'transparent', color: foreground },
      inlineMath: { color: foreground },
      highlight: { backgroundColor: secondary, color: foreground },
      spoiler: { color: mutedForeground, solid: { borderRadius: 4 } },
      superscript: { baselineOffsetScale: 0.3, fontScale: 0.75 },
    };
  }, [
    background,
    border,
    codeBlock,
    fontSizeStep,
    foreground,
    foregroundTertiary,
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
      md4cFlags={{ latexMath: true, superscript: true, underline: false }}
      onLinkPress={handleLinkPress}
      selectable={selectable}
    />
  );
}

function resolveCSSString(value: number | string | undefined, fallback = 'invalid'): string {
  return typeof value === 'string' ? value : fallback;
}
