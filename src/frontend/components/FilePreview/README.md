# FilePreview

Shared preview module for managed `FileEntry` records. Callers provide only an
entry ID and an optional square size; the module owns resolution, platform
rendering, opening, loading, and unavailable states.

The public module exports only `FilePreview`. Its extension registries and
`ImagePreview`, `QuickLookPreview`, and `FallbackPreview` implementations are
private. iOS generates cached Quick Look thumbnails for non-images. Android
keeps the generic file presentation and delegates opening to the system viewer.

Transient photo-library browsing and legacy message parts without a
`fileEntryId` remain feature-owned because they are not managed file entries.
