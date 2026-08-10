# FilePreview

Shared preview module for managed `FileEntry` records. Callers provide only an
entry ID and an optional square size; the module owns resolution, platform
rendering, opening, loading, and unavailable states.

The public module exports only `FilePreview`. Its extension registries and
`ImagePreview`, `QuickLookPreview`, and `FallbackPreview` implementations are
private. iOS generates cached Quick Look thumbnails for supported non-images;
images render directly. When no thumbnail renderer exists, both platforms use
`FallbackPreview` and delegate opening to the system viewer.

Composer attachments are imported into managed `FileEntry` records before they
become previewable. Message file parts without a `fileEntryId` are not rendered.
