# Document Export

Application-owned conversion and artifact lifetime. `DocumentExportRuntime` implements
`Backend.documentExport`; composition injects managed-file access tied to the originating database.
Sessions own immutable source snapshots, prepared assets, cancellation, current temporary output
and explicit persistence. `session.markdown` needs no file or resource reads and remains unbranded.
Markdown rendering embeds local/generated PNG/JPEG images as Base64 data URLs, reusing the image
asset cache. Failed reads stay retryable and produce an explicit note; remote Markdown links remain
authored. `session.previewMarkdown(text, presentation)` styles that exact prepared text and its
signature: embedded images display without captions and remote references remain name/domain entries.
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
HTML and images show no picture filenames or captions; unavailable images show a generic placeholder. Default image capture bounds each page;
explicit single-image capture and embedded source decoding still depend on device capacity.

See [Document Export](../../../../docs/references/document-export.md) for the capture protocol,
source validation, file lifetime and outstanding device acceptance.

`convertHtml` handles the HTML viewer's direct PNG/PPTX conversions without normalizing authored
HTML into document blocks. It consumes sequential frontend captures, streams image-only PPTX bytes,
and persists one managed file. [HTML Conversion](../../../../docs/references/html-conversion.md)
owns its limits, cancellation and rendering constraints.

Chat HTML and images share message-list layout; Markdown keeps portable title/role headings.
`contentPresentation.ts` owns readable file types and default copy; `renderHtmlStyles.ts` owns
HTML/image/Markdown-preview styling. Block code uses a fixed 192-point panel with a language label
and a visible opening excerpt. HTML and Markdown previews scroll within the panel to the complete
escaped source; images clip to the same opening viewport. Sources use one compact count row with
a single inline Globe icon and a source-localized summary, without a card list. Inline citations use quiet gray
superscripts and retain their destination URLs in HTML.
`renderTables.ts` preserves table rows, column headers, alignment and cell content in every format.
Images fit columns to the page width and wrap cell content. HTML/Markdown previews use content-based
column widths with horizontal scrolling for wide tables. Markdown keeps authored
content, represents resources explicitly, and uses portable blockquotes for included process text.
