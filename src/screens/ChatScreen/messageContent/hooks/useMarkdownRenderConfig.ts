import { useThemeColor } from 'heroui-native/hooks';
import { useCallback, useMemo } from 'react';
import { Linking } from 'react-native';
import type { LinkPressEvent, MarkdownStyle } from 'react-native-enriched-markdown';

export function useMarkdownRenderConfig() {
  const [foreground, muted, border, codeBackground, link] = useThemeColor([
    'foreground',
    'default-foreground',
    'border',
    'surface-secondary',
    'link',
  ]);

  const markdownStyle = useMemo<MarkdownStyle>(
    () => ({
      blockquote: {
        backgroundColor: codeBackground,
        borderColor: border,
        borderWidth: 1,
        color: foreground,
        fontSize: 16,
        gapWidth: 10,
        lineHeight: 24,
        marginBottom: 12,
        marginTop: 4,
      },
      code: {
        backgroundColor: codeBackground,
        borderColor: border,
        color: foreground,
        fontSize: 14,
      },
      codeBlock: {
        backgroundColor: codeBackground,
        borderColor: border,
        borderRadius: 8,
        borderWidth: 1,
        color: foreground,
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
        marginTop: 8,
        padding: 12,
      },
      h1: {
        color: foreground,
        fontSize: 24,
        fontWeight: '700',
        lineHeight: 30,
        marginBottom: 12,
        marginTop: 4,
      },
      h2: {
        color: foreground,
        fontSize: 21,
        fontWeight: '700',
        lineHeight: 28,
        marginBottom: 10,
        marginTop: 4,
      },
      h3: {
        color: foreground,
        fontSize: 18,
        fontWeight: '700',
        lineHeight: 25,
        marginBottom: 8,
        marginTop: 4,
      },
      inlineMath: {
        color: foreground,
      },
      link: {
        color: link,
        underline: true,
      },
      list: {
        bulletColor: muted,
        color: foreground,
        fontSize: 16,
        gapWidth: 8,
        lineHeight: 24,
        marginBottom: 10,
        marginLeft: 18,
        marginTop: 0,
        markerColor: muted,
        markerFontWeight: '600',
      },
      math: {
        backgroundColor: codeBackground,
        color: foreground,
        fontSize: 18,
        marginBottom: 12,
        marginTop: 8,
        padding: 10,
        textAlign: 'center',
      },
      paragraph: {
        color: foreground,
        fontSize: 16,
        lineHeight: 24,
        marginBottom: 10,
        marginTop: 0,
      },
      table: {
        borderColor: border,
        borderRadius: 8,
        borderWidth: 1,
        cellPaddingHorizontal: 10,
        cellPaddingVertical: 8,
        color: foreground,
        fontSize: 14,
        headerBackgroundColor: codeBackground,
        headerTextColor: foreground,
        lineHeight: 20,
        marginBottom: 12,
        marginTop: 8,
        rowEvenBackgroundColor: 'transparent',
        rowOddBackgroundColor: codeBackground,
      },
      thematicBreak: {
        color: border,
        height: 1,
        marginBottom: 12,
        marginTop: 12,
      },
    }),
    [border, codeBackground, foreground, link, muted],
  );

  const handleLinkPress = useCallback(({ url }: LinkPressEvent) => {
    Linking.openURL(url).catch(() => undefined);
  }, []);

  return {
    handleLinkPress,
    markdownStyle,
  };
}
