# Document Export

Application-owned conversion and artifact lifetime. `DocumentExportRuntime` implements
`Backend.documentExport`; composition injects managed-file access tied to the originating database.
Sessions own source snapshots, prepared image bytes, cancellation, current temporary output and
idempotent explicit persistence. `session.markdown` is prepared in memory without files or resource
reads; `render` materializes a requested file, reusing the current Markdown artifact when available. The frontend supplies native HTML capture through the shared
callback contract; backend code never imports UI.

See [Document Export](../../../../docs/references/document-export.md) for formats, limits, storage
semantics and pending native acceptance.
