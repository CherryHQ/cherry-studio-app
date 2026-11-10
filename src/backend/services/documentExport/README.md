# Document Export

Application-owned conversion and artifact lifetime. `DocumentExportRuntime` implements
`Backend.documentExport`; composition injects managed-file access tied to the originating database.
Sessions own immutable source snapshots, prepared assets, cancellation, bounded temporary output
and explicit persistence. `session.markdown` needs no file or resource reads and remains unbranded.
Markdown rendering embeds local/generated PNG/JPEG images as Base64 data URLs, reusing the image
asset cache. Failed reads stay retryable and produce an explicit note; remote Markdown links remain
authored. `session.previewMarkdown(text, presentation)` styles that exact prepared text and its
signature: embedded images display without captions and remote references remain name/domain entries.
`session.previewDocument(presentation)` provides the structured image preview without resource reads.
Markdown rendering applies the optional target watermark; reuse requires matching complete text.
HTML and image rendering share the resolved watermark independently of the image-only frame.
The `none` variant omits the brand footer. Watermark options do not add file metadata.

Markdown/HTML artifacts contain one immutable file descriptor and source text. Image artifacts
contain ordered immutable pages, each with its PNG file and dimensions. The frontend capture
callback delivers pages sequentially and retains each native file until its backend copy settles.
A batch is published only after all expected pages arrive in order. Failed or cancelled conversion
cleans its incomplete output and does not replace the previous artifact.

`save` returns an ordered collection of managed files. Successful individual saves survive a later
failure or cancellation; retrying the same artifact reuses those entries. Temporary output is
session-owned, while committed file-library entries outlive it. No saved image is re-encoded.

Valid still PNG/JPEG sources retain their original bytes without application byte/pixel/count caps.
HTML and images show no picture filenames or captions; unavailable images show a generic placeholder.
Message images retain the frozen source for actual layout measurement. After fonts and images
settle, one shared preview/capture script limits the whole card to 3600 logical points, including
the author row, insets and optional brand/QR footer. It keeps whole blocks, clamps a boundary
paragraph/list item by lines, retains complete code lines or table rows, and puts the ellipsis at
the last retained line/cell. Indivisible images, formulas and headings that do not fit are removed;
trailing orphan headings are removed too. There is no separate answer-count budget, overflow
allowance or body fade. Complete HTML/Markdown retain the original snapshot. Generic document images
retain full pagination. Source image decoding still depends on device capacity.

See [Document Export](../../../../docs/references/document-export.md) for the capture protocol,
source validation, file lifetime and outstanding device acceptance.

`convertHtml` handles the HTML viewer's direct PNG/PPTX conversions without normalizing authored
HTML into document blocks. It consumes sequential frontend captures, streams image-only PPTX bytes,
and returns a temporary artifact with explicit save/dispose methods. [HTML Conversion](../../../../docs/references/html-conversion.md)
owns its limits, cancellation and rendering constraints.

Chat HTML and images share message-list layout; Markdown keeps portable title/role headings.
`contentPresentation.ts` owns readable file types and default copy; `renderHtmlStyles.ts` owns
HTML/image/Markdown-preview styling. Block code uses a fixed 192-point panel with a language label
and a scrollable opening viewport in rendered HTML previews. Image code instead wraps and
continues between lines across generic document pages; message cards retain complete code-line prefixes.
Sources use one compact count row with
a single inline Globe icon and a source-localized summary, without a card list. Inline citations use quiet gray
superscripts and retain their destination URLs in HTML.
`renderTables.ts` preserves table rows, column headers, alignment and cell content in every format.
Images fit columns to the page width and wrap cell content. HTML/Markdown previews use content-based
column widths with horizontal scrolling for wide tables. Markdown keeps authored
content and represents resources explicitly. The chat adapter excludes thinking and process blocks
from every format.
