# FileEntryPreview

Application adapter from a managed `FileEntryId` to CherryUI's business-neutral `FilePreview`.
It resolves the entry and local URI, classifies images, injects translations, logs preview failures,
and presents an Alert when the system viewer cannot open a file.

`LoadedFileEntryPreview` is the same adapter for a caller that already holds the `FileEntry` — a
list page, say — and so resolves only the URI instead of re-reading the row.

`FileEntrySkeleton` is the shared same-sized placeholder for both adapters and file-entry grids.

CherryUI owns ready and unavailable preview rendering and platform behavior, including image and
fallback previews, Quick Look thumbnail caching, and system opening. Callers that already have a
neutral file descriptor should use CherryUI `FilePreview` directly.
