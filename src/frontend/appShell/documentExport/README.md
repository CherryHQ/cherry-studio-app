# Document Export Entry

`useDocumentExport().open` creates a source-neutral export session and opens `/document-export`.
Only a request ID enters navigation. This owner retains the transient handoff until the page closes,
rejects overlapping requests, releases abandoned navigation, and waits for session cleanup before
admitting the next request. The backend runtime remains the application-shutdown backstop.

Conversion and persistence belong to `Backend.documentExport`; route UI and capture belong to
`features/documentExport`.
