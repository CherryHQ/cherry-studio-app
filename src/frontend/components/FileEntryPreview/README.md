# FileEntryPreview

Application adapter from a managed `FileEntryId` to CherryUI's business-neutral `FilePreview`.
It resolves the entry and local URI, classifies images, injects translations, logs preview failures,
and presents an Alert when the system viewer cannot open a file.

CherryUI owns all rendering and platform behavior, including image and fallback previews, loading
and unavailable states, Quick Look thumbnail caching, and system opening. Callers that already have
a neutral file descriptor should use CherryUI `FilePreview` directly.
