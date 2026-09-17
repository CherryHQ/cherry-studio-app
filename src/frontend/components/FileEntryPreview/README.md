# FileEntryPreview

Application adapter from a managed `FileEntryId` to CherryUI's business-neutral file components.
It owns entry and URI resolution, the closed product classification, translations, preview error
logging, and the single opening policy shared by the composer, messages, and file library.

## Public Interface

- `FileEntryPreview`: a square attachment tile resolved by entry id.
- `LoadedFileEntryPreview`: the same tile with caller-resolved entry, original URI, and preview URI.
- `FileEntryAttachment`: an assistant deliverable. Images render directly at their aspect ratio,
  with a height cap of 1.25 times the width; other kinds retain a full-width file row.
- `FileEntrySkeleton` and `FileEntryAttachmentSkeleton`: loading placeholders owned by the adapter.
- `fileEntryPreviewKind`: one `mediaType` classifier for `image`, `markdown`, `text`, `html`, `pdf`,
  `office`, and `document`. SVG stays an image on file surfaces but opens in the vector viewer.
  JSON, XML, and YAML belong to `text`; DOCX/XLSX/PPTX belong to `office`; legacy Office and other
  platform-opened formats belong to `document`.
- `useResolvedFile`: entry and local-byte resolution for cards and the viewer, with explicit retry.
- `useOpenFileEntry`: `openFileEntry` routes supported kinds to `/files/[fileEntryId]` and hands
  `document` to the platform. `office` uses the same local application viewer on iPhone, iPad
  and Android. `openFileEntryWithSystem` is the viewer's explicit escape hatch.
- `PreviewImage`: CherryUI `Image` that degrades to its label with the preview-failed copy, shared by
  the attachment image and painting outputs so neither renders a broken frame.

Application-level sharing and watermark preparation belong to `appShell/fileExport`. System
opening consumes its `prepareFileExport`; completed document exports retain their original bytes.

Opening failures report a toast. Thumbnail failures are logged and keep the existing fallback.
The image thumbnail query uses the same resolved-entry shape and query key as the file library.

The adapters forward CherryUI's `variant`: the composer uses `attachment` (icon above the file
title), and the library uses `card` (title above the icon). Images keep their thumbnails. Both
variants use Quick Look artwork on iOS and shared file icon/color presets on Android, while the default `thumbnail` retains
plugin and platform preview rendering. `LoadedFileEntryPreview` also forwards a caller-owned
`badge`, used for the library's generated-file provenance without reserving empty metadata rows.

## Renderer Boundary

CherryUI requires `onPress` and owns the frame, press target, unavailable state, plugin registry,
image rendering, and iOS Quick Look thumbnails. It exports `openFilePreview` as a system-opening
primitive, without deciding application navigation.

A renderer that needs only a neutral file descriptor and platform APIs belongs in CherryUI.
Product-specific parsing or backend calls remain in this adapter family. Add a new product kind
only with explicit card and opening behavior; the CherryUI plugin vocabulary itself stays open.
Do not infer a second classification from filenames at individual surfaces.

Library list and file-picker rows use `thumbnail`: iOS requests Quick Look artwork and Android
keeps the shared type artwork. The row still owns opening/selection; the preview remains excluded
from touch and accessibility hit targets. The optional generic `icon` variant remains available
for callers that explicitly want icon-only artwork.

The viewer and export behavior are documented in
[File Preview And Viewer](../../../../docs/references/file-preview-and-viewer.md).
