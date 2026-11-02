# Chat Export Preview And Capture

This chat-owned layer renders immutable document sessions inside `ChatShareSheet`. It has no
independent route or app-shell handoff. `useShareChat` owns and disposes the source snapshots;
`useDocumentExportPreview` serializes rendering and cancellation before admitting a replacement.
The backend document-export service still owns resources, temporary files and managed persistence.

The preview uses actual generated PNGs in a virtualized native horizontal carousel. It has no
separate reading page or theme picker. Image colors follow the current app theme. A fully opaque
foreground hides capture frames, and one loading state covers preparation and rendering.

Images use fixed 360-logical-pixel layout at 3x density. Chat page slices hold up to 640 content
points with 16 points of top spacing. Content is never omitted to fit a preview. The long-image
option tiles the native capture and retains the complete document in one file.

HTML keeps a responsive column capped at 720 points and follows app colors; Markdown preserves
complete source. Image failures fall back to HTML, then Markdown. The preview and actions report
the actual available format. The global watermark preference initializes the per-share setting;
changes affect every output format and never modify the global preference. Thinking is excluded
by default. Captured translations remain present in both thinking snapshots.

`useDocumentExportHtmlCapture` supplies scripts and frames to the shared
[`HtmlCapture`](../../../../components/HtmlCapture/README.md) executor. It waits for fonts, decoded
assets and stable layout. Painted ranges protect text lines, images, normal table rows, complete
code panels and the brand/QR footer. An indivisible object that cannot fit causes format fallback.
Included thinking expands before image capture. HTML retains interactive disclosures; Markdown
uses portable nested blockquotes. Code images retain the existing fixed 192-point opening preview;
HTML scrolls the complete code and Markdown retains it in full.

Paged capture copies and releases each native PNG before moving on. Single-image capture measures
the available native viewport and tiles both axes at 3x density. All tiles refer to the same canvas
coordinates. A viewport resize aborts the outdated capture and schedules a new preview against
the settled bounds. Skia composes the tiles on the existing Worklets worker. Long-image final
allocation still grows with document length and has no guarantee of arbitrary device capacity.

Saving or sharing freezes the active presentation until delivery finishes. Saved files retain
`document-export` provenance and never receive a second watermark. Photos saving requests add-only
permission once per batch, preserves order and resumes partially saved batches without duplicates.
Closing the system chooser leaves the preview and selected messages in place; only
closing the app's sharing sheet returns to the conversation.

Tests, type checks, builds and device acceptance are user-owned. Source-level coverage is not proof
of image sharpness, sheet gesture behaviour or recipient compatibility. See
[Document Export](../../../../../../docs/references/document-export.md) for the backend content,
resource, persistence and degradation contract.
