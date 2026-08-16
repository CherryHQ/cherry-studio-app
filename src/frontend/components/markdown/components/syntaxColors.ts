import type { MarkdownStyle } from 'react-native-enriched-markdown';

type SyntaxColors = NonNullable<NonNullable<MarkdownStyle['codeBlock']>['syntaxColors']>;

/**
 * Code-block syntax highlighting is native (tree-sitter) as of
 * react-native-enriched-markdown 1.0, but every token type left unset is drawn
 * in the plain code color — so an unconfigured `syntaxColors` renders a code
 * block that looks exactly like the unhighlighted one. These two palettes are
 * what actually turns the feature on.
 *
 * They mirror the desktop app's Shiki defaults (`one-light` in light mode,
 * `material-theme-darker` in dark) so a snippet reads the same on both ends.
 * Alignment stops at contrast: a handful of the upstream colors fall below 3:1
 * on our `code-block` surface, and those are corrected rather than copied.
 *
 * `operator` and `punctuation` are deliberately absent from the light palette,
 * and `variable` from the dark one — both source themes leave those at the
 * body text color, which is what omitting them already produces.
 */

/** One Light. `string` and `type` are darkened from #50A14F/#C18401 (2.9:1). */
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

/** Material Theme Darker, unmodified apart from the comment color. */
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

/**
 * Both source themes pick a comment gray against their own editor background,
 * which lands at 2.3:1 on ours — illegible. `muted-foreground` is the token
 * that already means "de-emphasized but readable", so comments defer to it
 * instead of to the upstream value.
 */
export function resolveSyntaxColors(theme: string, mutedForeground: string): SyntaxColors {
  const palette = theme === 'dark' ? DARK_SYNTAX_COLORS : LIGHT_SYNTAX_COLORS;

  return { ...palette, comment: mutedForeground };
}
