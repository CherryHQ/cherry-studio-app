# Mermaid Diagram

Displays complete Mermaid fences from Markdown as diagrams. The app's `MarkdownText` adapter passes
`MermaidBlock` to CherryUI's `renderMermaid` slot; callers keep message content, storage and Agent
behavior. Rendering uses the offline page in
[`@cherrystudio/mermaid-webview`](../../../../packages/mermaid-webview/README.md).

## Public Interface

- `MermaidBlock` presents one fence inside Markdown, with the fence's code block as its fallback.
- `MermaidRendererHost` is mounted once in the root layout, before the navigator.
- `MermaidSvgView`, `useMermaidRender`, and `readMermaidViewerHandoff` serve the
  [viewer page](../../features/mermaidDiagram/MermaidDiagramScreen.tsx).

## Rendering

One hidden WebView renders every diagram. `mermaidRenderer` queues requests and sends them one at a
time. The host mounts the page while diagrams wait and for one minute afterwards, so a transcript
without diagrams never loads it. Opaque screens cover the page, which keeps it laid out for
measurement.

A rendered diagram is displayed by a separate script-free WebView that only receives the SVG. The
transcript therefore never parses SVG on the JavaScript thread or mounts a native view per shape.

Results are cached by source and theme, up to 48 entries and 8 MiB of SVG, and read synchronously
on mount. Changing the theme renders the diagram again.

A failure stays cached like a result, so the diagram is not retried while the entry remains: invalid
syntax, an oversized source, or a page that cannot load, crashes, or stops answering. Initialization
has a 10-second deadline starting with the first waiting request, including HTML asset loading and
the page's ready message. An initialization error or timeout fails the waiting batch and releases
the page without retrying; a new uncached request can start it again.

Once ready, each diagram has its own 10-second rendering deadline. A crashed or hung page fails its
current diagram and is replaced to continue with the next one. The replacement has the same bounded
initialization wait, and messages from retired pages are ignored.

## Presentation

`MermaidBlock` uses the code block's frame: its background, 12-point radius, a `mermaid` header with
a copy-source action, and the 192-point height limit. The block's height is fixed, so neither
finishing a streamed fence nor remounting a message scrolled out of view moves the transcript. A
failed diagram shows its code block instead.

The preview fits the whole diagram into the frame without enlarging small diagrams, and it has no
interaction of its own. Tapping it opens the `/mermaid-diagram` page. The source travels through an
in-memory handoff, never the URL or saved navigation state. The viewer starts at screen width and
uses the platform's pinch zoom and scrolling. After a restart, the viewer has no handoff to read and
shows that the diagram is unavailable.

## Validation Status

Unit tests cover the queue, cache, failure policy, page protocol, display document, and the block's
mount states. The page was rendered in desktop Chrome for flowchart, sequence, class, state, ER,
Gantt, pie, mind map, timeline, journey, and Git graph diagrams in both themes. iOS and Android
device acceptance is pending:

- the hidden page renders behind opaque screens, including liquid glass headers;
- previews in light and dark, with Chinese and English labels;
- scrolling a transcript across diagram blocks, and remounting one after scrolling away;
- completing a fence while streaming;
- pinch zoom in the viewer;
- copying the source;
- a diagram with invalid syntax keeps its code block.
