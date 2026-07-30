import { useThemeColor } from 'heroui-native/hooks';
import { useColorScheme } from 'react-native';
import { EnrichedMarkdownText, type MarkdownStyle } from 'react-native-enriched-markdown';
import { StreamdownText } from 'react-native-streamdown';

import { useMarkdownLinkPress } from '../hooks/useMarkdownLinkPress';

type PartMarkdownProps = {
  isStreaming: boolean;
  markdown: string;
};

export function PartMarkdown({ isStreaming, markdown }: PartMarkdownProps) {
  const { handleLinkPress } = useMarkdownLinkPress();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const MarkdownRenderer = isStreaming ? StreamdownText : EnrichedMarkdownText;

  const [foreground, background, muted, accent, border, defaultColor] = useThemeColor([
    'foreground',
    'background',
    'muted',
    'accent',
    'border',
    'default',
  ]);

  const markdownStyle: MarkdownStyle | undefined = isDark
    ? {
        paragraph: { color: foreground },
        h1: { color: foreground },
        h2: { color: foreground },
        h3: { color: foreground },
        h4: { color: foreground },
        h5: { color: foreground },
        h6: { color: foreground },
        blockquote: {
          color: muted,
          borderColor: muted,
          backgroundColor: background,
        },
        list: {
          color: foreground,
          bulletColor: foreground,
          markerColor: foreground,
        },
        code: {
          color: foreground,
          borderColor: border,
          backgroundColor: defaultColor,
        },
        link: {
          color: accent,
        },
        strong: { color: foreground },
        em: { color: foreground },
        strikethrough: { color: muted },
        underline: { color: foreground },
        thematicBreak: { color: muted },
        table: {
          color: foreground,
          headerTextColor: foreground,
          headerBackgroundColor: defaultColor,
          rowEvenBackgroundColor: background,
          rowOddBackgroundColor: background,
          borderColor: border,
        },
        taskList: {
          checkedColor: accent,
          borderColor: muted,
          checkmarkColor: foreground,
          checkedTextColor: muted,
        },
        math: { color: foreground, backgroundColor: defaultColor },
        inlineMath: { color: foreground },
        spoiler: { color: foreground },
      }
    : undefined;

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
