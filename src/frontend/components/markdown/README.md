# Markdown

Shared Markdown rendering for chat content and non-chat previews. The public `MarkdownText`
component owns renderer selection, theme colors, links, and the global typography preference.

## Code blocks

Syntax highlighting is native (tree-sitter, compiled into the binary) and math is rendered by
RaTeX, both enabled by default in react-native-enriched-markdown. Neither is reachable from JS
alone: highlighting draws every token type without a color in the plain code color, so the
palettes in `components/syntaxColors.ts` are what makes it visible. Only the grammars compiled
into the build highlight at all — the curated default set covers 14 languages, and `cpp`, `swift`,
`php`, `ruby`, and `c-sharp` are opt-in through the library's Expo config plugin. A language that
is not compiled in renders as plain code rather than failing.
