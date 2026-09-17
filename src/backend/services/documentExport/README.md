# Document Export

Application-owned conversion and artifact lifetime. `DocumentExportRuntime` implements
`Backend.documentExport`; composition injects managed-file access tied to the originating database.
Sessions own immutable source snapshots, prepared assets, cancellation, current temporary output
and explicit persistence. `session.markdown` needs no file or resource reads and remains unbranded.
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
Unavailable or unsupported images remain placeholders. Default image capture bounds each page;
explicit single-image capture and embedded source decoding still depend on device capacity.

See [Document Export](../../../../docs/references/document-export.md) for the capture protocol,
source validation, file lifetime and outstanding device acceptance.

`convertHtml` handles the HTML viewer's direct PNG/PPTX conversions without normalizing authored
HTML into document blocks. It consumes sequential frontend captures, streams image-only PPTX bytes,
and persists one managed file. [HTML Conversion](../../../../docs/references/html-conversion.md)
owns its limits, cancellation and rendering constraints.
