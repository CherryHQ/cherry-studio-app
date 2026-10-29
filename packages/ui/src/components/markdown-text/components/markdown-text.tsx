import { Fragment, type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import {
  EnrichedMarkdownText,
  type LinkPressEvent,
  type MarkdownStyle,
} from 'react-native-enriched-markdown';
import { StreamdownText } from 'react-native-streamdown';
import { useCSSVariable, useUniwind } from 'uniwind';

import { normalizeLatexDelimiters } from '../../../markdown';
import { splitMermaidBlocks } from '../../../markdown/split-mermaid-blocks';
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

/**
 * Native copy menus are presented by the renderer itself, on text selections and
 * on Markdown tables. Their labels are product copy, so product code passes them
 * in translated; omitting them leaves the library's English defaults, which is
 * only ever acceptable in stories.
 */
export type MarkdownSelectionMenuLabels = {
  copy: string;
  copyAsMarkdown: string;
};

export type MarkdownTextProps = {
  /**
   * URL prefix of inline citation markers. Citations annotate the answer rather
   * than navigate away from it, so they render in a low-emphasis neutral instead
   * of the link color.
   */
  citationLinkPrefix?: string;
  fontSizeStep: TypographySizeStep;
  isStreaming?: boolean;
  markdown: string;
  onLinkPress: (url: string) => void;
  /**
   * Presents a complete top-level Mermaid fence. `fallback` is the fence as an ordinary code
   * block, for diagrams the caller cannot present. Without it, Mermaid stays a code block.
   */
  renderMermaid?: (diagram: { source: string; fallback: ReactElement }) => ReactNode;
  selectable?: boolean;
  selectionMenuLabels?: MarkdownSelectionMenuLabels;
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
  citationLinkPrefix,
  fontSizeStep,
  isStreaming = false,
  markdown,
  onLinkPress,
  renderMermaid,
  selectable = true,
  selectionMenuLabels,
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
  // Its native streaming mode still ends with the part, releasing pending tail
  // blocks and forcing a final layout even when the Markdown hasn't changed.
  const MarkdownRenderer = isStreaming || hasStreamed ? StreamdownText : EnrichedMarkdownText;
  const handleLinkPress = ({ url }: LinkPressEvent) => onLinkPress(url);
  const selectionMenuConfig = useMemo(
    () =>
      selectionMenuLabels && {
        copy: { label: selectionMenuLabels.copy },
        copyAsMarkdown: { label: selectionMenuLabels.copyAsMarkdown },
      },
    [selectionMenuLabels],
  );
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
      linkVariants: citationLinkPrefix
        ? { [`^${escapeRegExp(citationLinkPrefix)}`]: { color: foregroundTertiary } }
        : undefined,
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
    citationLinkPrefix,
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

  const normalizedMarkdown = useMemo(
    () => normalizeLatexDelimiters(markdown, isStreaming),
    [isStreaming, markdown],
  );

  const parts = useMemo(
    () => (renderMermaid ? splitMermaidBlocks(normalizedMarkdown, isStreaming) : undefined),
    [isStreaming, normalizedMarkdown, renderMermaid],
  );

  const renderMarkdown = (markdown: string, key: string, isTail: boolean) => (
    <MarkdownRenderer
      key={key}
      allowTrailingMargin={false}
      flavor="github"
      markdown={markdown}
      markdownStyle={markdownStyle}
      md4cFlags={{ latexMath: true, superscript: true, underline: false }}
      onLinkPress={handleLinkPress}
      selectable={selectable}
      // iOS derives the translucent highlight and handles from one opaque tint.
      selectionColor={Platform.OS === 'ios' ? mutedForeground : secondary}
      selectionHandleColor={mutedForeground}
      selectionMenuConfig={selectionMenuConfig}
      streamingAnimation={isStreaming && isTail}
    />
  );

  if (!parts || !renderMermaid) return renderMarkdown(normalizedMarkdown, '0', true);

  // The wrapper stays mounted while fences complete, so streamed segments keep their native views.
  // Each segment drops its trailing margin; the gap restores the code block's 12-point rhythm.
  return (
    <View className="gap-3">
      {parts.map((part, index) => {
        const content = renderMarkdown(part.markdown, part.key, index === parts.length - 1);
        return part.kind === 'mermaid' ? (
          <Fragment key={part.key}>
            {renderMermaid({ source: part.source, fallback: content })}
          </Fragment>
        ) : (
          content
        );
      })}
    </View>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveCSSString(value: number | string | undefined, fallback = 'invalid'): string {
  return typeof value === 'string' ? value : fallback;
}
