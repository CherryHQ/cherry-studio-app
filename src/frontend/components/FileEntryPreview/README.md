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
- `fileEntryPreviewKind`: one `mediaType` classifier for `image`, `markdown`, `text`, `html`, and
  `document`. JSON, XML, and YAML belong to `text`; PDF and unsupported types belong to `document`.
- `useResolvedFile`: entry and local-byte resolution for cards and the viewer, with explicit retry.
- `useOpenFileEntry`: `openFileEntry` routes supported kinds to `/files/[fileEntryId]` and hands
  `document` to the platform. `openFileEntryWithSystem` is the viewer's explicit escape hatch.

Opening failures report a toast. Thumbnail failures are logged and keep the existing fallback.
The image thumbnail query uses the same resolved-entry shape and query key as the file library.

## Renderer Boundary

CherryUI requires `onPress` and owns the frame, press target, unavailable state, plugin registry,
image rendering, and iOS Quick Look thumbnails. It exports `openFilePreview` as a system-opening
primitive, without deciding application navigation.

A renderer that needs only a neutral file descriptor and platform APIs belongs in CherryUI.
Product-specific parsing or backend calls remain in this adapter family. Add a new product kind
only with explicit card and opening behavior; the CherryUI plugin vocabulary itself stays open.
Do not infer a second classification from filenames at individual surfaces.

Cards keep the current platform fallback for text and unsupported documents. Text excerpts are a
separate follow-up; this implementation prioritizes opening and using the file.

The viewer and export behavior are documented in
[File Preview And Viewer](../../../../docs/references/file-preview-and-viewer.md).
