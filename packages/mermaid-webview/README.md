# Mermaid WebView

The trusted offline page that turns Mermaid source into SVG inside a hidden WebView. The app side,
including the queue, cache and display, lives in
[`src/frontend/components/MermaidDiagram`](../../src/frontend/components/MermaidDiagram/README.md).

It bundles `mermaid` 12.2.0, so every diagram family Mermaid supports renders with the same parser
and layout as other Mermaid hosts. Parsing and layout run in the WebView's content process: a
diagram that crashes or hangs the page cannot crash the app.

## Build

`postinstall` runs `vite build`, so every `pnpm install` (development, CI and EAS) regenerates
`dist/mermaid.html`, about 5.2 MB with all JavaScript inlined. The output is not committed. The app
ships it as a Metro asset and loads it with `source={{ html }}`. Run
`pnpm --filter @cherrystudio/mermaid-webview build` after changing this package.

## Page Contract

- **CSP.** `default-src 'none'` with inline scripts and styles, and `data:` images and fonts.
  Diagrams cannot reach the network or local files.
- **Security level.** Mermaid runs in `strict` mode: label HTML is sanitized, and click callbacks and
  links are disabled.
- **Theme.** Light and dark use Mermaid's monochrome outlined `redux` and `redux-dark` themes, which
  match the app's neutral surfaces. Pie slices are categorical data and use the Tableau 10 palette
  with black labels, which keep 4.5:1 contrast on every slice. Colors written in a diagram's own
  source are kept.
- **Fonts.** The page uses system fonts. The display WebView draws with the same fonts, so labels
  fit the shapes measured here.
- **Limits.** Sources above 32,768 characters and SVG above 1 MiB count as failures.

## Bridge Protocol

[`src/protocol.ts`](src/protocol.ts) is shared by the page and the app. The app validates every page
message with `parseMermaidPageMessage`.

| Direction | Message | Meaning |
| --- | --- | --- |
| App → page | `window.cherryMermaid.render({ id, source, dark })` | Render one diagram; requests run in order |
| Page → app | `ready` | The page can receive requests |
| Page → app | `rendered` | `{ id, svg, width, height }`; the size comes from the SVG `viewBox` |
| Page → app | `failed` | `{ id }`; invalid syntax, an unusable result, or an oversized source |
