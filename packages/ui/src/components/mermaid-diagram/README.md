# Mermaid Diagram

`MermaidDiagram` is a UI-only display primitive. Pass Mermaid `source`, an optional
`fontSizeStep`, and an optional React element `fallback`. The default fallback displays selectable
source text. Colors follow the current CherryUI theme; callers own content and business state.

Rendering uses the private [native adapter](../../../../../modules/mermaid-renderer/README.md),
then `react-native-svg`. Native calls run asynchronously and obsolete results cannot replace a
newer source or theme. A bounded cache reuses source/theme layouts across recycled message rows.

`MarkdownText` extracts complete top-level Mermaid fences. Unclosed streaming fences, quoted/list
fences, indented code, and code examples remain with the existing native Markdown renderer.
Reference definitions are carried into ordinary text segments so links still resolve across a
diagram. Selection is local to each native Markdown segment; whole-message copy remains owned by
the message feature and uses its original source.

The diagram owns horizontal scrolling and has no tap, long-press, or custom pan action. Vertical
scrolling belongs to the surrounding transcript; native scroll views arbitrate axes and system
gestures. The source fallback retains native text selection. There is no added motion or editor.

Stories live at `Components/Mermaid Diagram`. Native and device validation remains pending, as
recorded in the adapter's README.
