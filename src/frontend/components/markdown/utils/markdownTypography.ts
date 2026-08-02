import type { MarkdownStyle } from 'react-native-enriched-markdown';

import { resolveTypographyScale } from '@/frontend/utils/typographyScale';

export function createMarkdownTypographyStyle(fontSizeStep: unknown): MarkdownStyle {
  const scale = resolveTypographyScale(fontSizeStep);

  return {
    paragraph: scale.base,
    h1: scale['3xl'],
    h2: scale['2xl'],
    h3: scale.xl,
    h4: scale.lg,
    h5: scale.base,
    h6: scale.sm,
    blockquote: scale.base,
    list: scale.base,
    codeBlock: scale.sm,
    table: scale.sm,
    math: { fontSize: scale.xl.fontSize },
  };
}
