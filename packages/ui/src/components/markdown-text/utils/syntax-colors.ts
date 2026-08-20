import type { MarkdownStyle } from 'react-native-enriched-markdown';

type SyntaxColors = NonNullable<NonNullable<MarkdownStyle['codeBlock']>['syntaxColors']>;

const LIGHT_SYNTAX_COLORS: SyntaxColors = {
  keyword: '#A626A4',
  string: '#3D7F3C',
  number: '#986801',
  constant: '#986801',
  function: '#4078F2',
  type: '#A16C00',
  variable: '#E45649',
  property: '#E45649',
  tag: '#E45649',
  attribute: '#986801',
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
