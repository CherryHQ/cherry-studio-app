# Document Export

Application-owned conversion and artifact lifetime. `DocumentExportRuntime` implements
`Backend.documentExport`; composition injects managed-file access tied to the originating database.
Sessions own source snapshots, prepared image bytes, cancellation, current temporary output and
idempotent explicit persistence. `session.markdown` is prepared in memory without files or resource
reads; `render` adds an optional Markdown brand signature and materializes a requested file, reusing
the current Markdown artifact when its complete text matches. The frontend supplies native HTML
capture through the shared callback contract; backend code never imports UI.

Every artifact contains one immutable file descriptor. Watermark options affect rendered bytes
only; they do not add file metadata. Image artifacts also contain the captured
width and height. A capture is published only after the image has been copied and validated.
`save` returns one managed file and reuses it for repeated sharing of the same artifact. Temporary
cleanup covers the artifact directory; committed files outlive the session.

See [Document Export](../../../../docs/references/document-export.md) for formats, limits, storage
semantics and pending native acceptance.

`convertHtml` handles the HTML viewer's direct PNG/PPTX conversions without normalizing authored
HTML into document blocks. It consumes sequential frontend captures, streams image-only PPTX bytes,
and persists one managed file. [HTML Conversion](../../../../docs/references/html-conversion.md)
owns its limits, cancellation and rendering constraints.
