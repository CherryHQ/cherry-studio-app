# Markdown

Application adapter over CherryUI `MarkdownText` for chat content and non-chat previews. It owns
only the global typography preference and opening external links; CherryUI owns renderer selection,
theme tokens, syntax highlighting, GitHub flavor, LaTeX, and typography styles.

## Code blocks

Syntax highlighting is native (tree-sitter, compiled into the binary) and math is rendered by
RaTeX, both enabled by default in react-native-enriched-markdown. Neither is reachable from JS
alone: highlighting draws every token type without a color in the plain code color, so the
palettes in CherryUI are what makes it visible. Only the grammars compiled
into the build highlight at all — the curated default set covers 14 languages, and `cpp`, `swift`,
`php`, `ruby`, and `c-sharp` are opt-in through the library's Expo config plugin. A language that
is not compiled in renders as plain code rather than failing.
