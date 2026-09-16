import type { MarkdownStyle } from 'react-native-enriched-markdown';

type SyntaxColors = NonNullable<NonNullable<MarkdownStyle['codeBlock']>['syntaxColors']>;

const LIGHT_SYNTAX_COLORS: SyntaxColors = {
  keyword: '#A626A4',
  string: '#337533',
  number: '#8D5E00',
  constant: '#8D5E00',
  function: '#2A5FD7',
  type: '#915C00',
  variable: '#C0332B',
  property: '#C0332B',
  tag: '#C0332B',
  attribute: '#8D5E00',
  embedded: '#CA1243',
};

const DARK_SYNTAX_COLORS: SyntaxColors = {
  keyword: '#C792EA',
  operator: '#89DDFF',
  punctuation: '#89DDFF',
  string: '#C3E88D',
  number: '#F78C6C',
  constant: '#FF9CAC',
  function: '#82AAFF',
  type: '#FFCB6B',
  property: '#F07178',
  tag: '#F07178',
  attribute: '#C792EA',
  embedded: '#89DDFF',
};

export function resolveSyntaxColors(theme: string, mutedForeground: string): SyntaxColors {
  const palette = theme === 'dark' ? DARK_SYNTAX_COLORS : LIGHT_SYNTAX_COLORS;

  return { ...palette, comment: mutedForeground };
}
