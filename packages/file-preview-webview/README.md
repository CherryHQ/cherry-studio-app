# File Preview WebView

The trusted page that renders `@cherrystudio/file-preview` (PDF, DOCX, PPTX and XLSX) inside the
file viewer's WebView. The package owns rendering and in-document interaction; this page only wires
it to the app: bytes, PDF resources, theme, locale, diagnostics and the system-open request.
The app side lives in [`src/frontend/features/files`](../../src/frontend/features/files/README.md).

> Status: local testing. `@cherrystudio/file-preview` is installed from a locally packed tarball
> (`file:/tmp/fp-pack/...`). Replace it with the published npm version before this leaves draft.

## Build

`postinstall` runs `vite build`, so every `pnpm install` (development, CI and EAS) regenerates
`dist/`. The output is not committed:

| File | Content |
| --- | --- |
| `file-preview.html` | The page with all JavaScript, CSS and both worker sources inlined |
| `pdf-resources.bin` | pdf.js CMaps and standard fonts, concatenated |
| `pdf-resources.json` | `cmap/<name>` and `standard_font/<filename>` → `[offset, length]` |

The app ships these as Metro assets (`bin` is registered in `metro.config.js`), reads the HTML into
a string and loads it with `source={{ html, baseUrl: FILE_PREVIEW_BASE_URL }}`. Run
`pnpm --filter @cherrystudio/file-preview-webview build` after changing this package.

The worker sources are imported with `?raw` and started from blob URLs through
`resources.createWorker`. The inline build escapes `</script`, `</style` and `<!--` as `\x3C`, and
drops the package's fallback worker files because `createWorker` always takes precedence.

## Page Contract

- **Origin.** The page runs at `https://file-preview.local/`, which is never fetched. An opaque
  `about:blank` origin cannot start module workers from blob URLs.
- **CSP.** `default-src 'none'`; inline scripts and styles, and `blob:`/`data:` for workers, images,
  fonts and media. Rendered documents cannot reach the network.
- **Viewport.** `user-scalable=no`; the package owns pinch zoom inside its panes.

## Preview Options

`main.tsx` enables the package's opt-in host options: `bottomInset: 'content'`, DOCX
`initialZoom: 'fit-width'` and `normalizeSymbolBullets`, and XLSX `opaqueHeaders`. The PDF
outline uses `overlay` below 640 CSS pixels of page width and `panel` otherwise; a `resize`
listener re-renders with the matching layout, so rotation needs no message from the app.

## Bridge Protocol

[`src/protocol.ts`](src/protocol.ts) is shared by the page and the app. The app validates every page
message with `PageMessageSchema`.

| Page → app | Meaning |
| --- | --- |
| `ready` | The page can receive `render` |
| `open` | `PreviewSource.open()`; each call opens an independent document |
| `read`, `resource` | Exact byte range of a document, or a bundled PDF resource |
| `cancel`, `close` | Abort a request; release a document (idempotent) |
| `diagnostic`, `error` | Routed to the app logger |
| `requestOpen` | `unsupported` or `too_large`, handled by the app |

The app answers through `window.__filePreviewPage.receive(message)`: `render` (source, locale,
dark mode, CSS custom properties), `opened` (`size`, `revision`), and `chunk` (base64, at most
1 MiB raw) followed by `done` or `failed` with a `PreviewErrorCode`. The page writes chunks into one
buffer of the requested length and rejects a short total. Aborted reads reject immediately and send
`cancel`; reads after `close` reject with `closed` on both sides.
