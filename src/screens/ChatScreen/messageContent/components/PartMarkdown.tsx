import { EnrichedMarkdownText } from 'react-native-enriched-markdown';

import { useMarkdownRenderConfig } from '../hooks/useMarkdownRenderConfig';

type PartMarkdownProps = {
  markdown: string;
};

export function PartMarkdown({ markdown }: PartMarkdownProps) {
  const { handleLinkPress, markdownStyle } = useMarkdownRenderConfig();

  return (
    <EnrichedMarkdownText
      allowTrailingMargin={false}
      containerStyle={{ width: '100%' }}
      flavor="github"
      markdown={markdown}
      markdownStyle={markdownStyle}
      md4cFlags={{ latexMath: true, underline: false }}
      onLinkPress={handleLinkPress}
      selectable
    />
  );
}
