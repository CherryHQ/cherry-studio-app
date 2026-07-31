import { useColorScheme } from 'react-native';
import { EnrichedMarkdownText, type MarkdownStyle } from 'react-native-enriched-markdown';
import { StreamdownText } from 'react-native-streamdown';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
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

  const [foreground, background, mutedForeground, link, primary, border, secondary] = useThemeColor(
    ['foreground', 'background', 'muted-foreground', 'link', 'primary', 'border', 'secondary'],
  );

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
          color: mutedForeground,
          borderColor: mutedForeground,
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
          backgroundColor: secondary,
        },
        link: {
          color: link,
        },
        strong: { color: foreground },
        em: { color: foreground },
        strikethrough: { color: mutedForeground },
        underline: { color: foreground },
        thematicBreak: { color: mutedForeground },
        table: {
          color: foreground,
          headerTextColor: foreground,
          headerBackgroundColor: secondary,
          rowEvenBackgroundColor: background,
          rowOddBackgroundColor: background,
          borderColor: border,
        },
        taskList: {
          checkedColor: primary,
          borderColor: mutedForeground,
          checkmarkColor: foreground,
          checkedTextColor: mutedForeground,
        },
        math: { color: foreground, backgroundColor: secondary },
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
