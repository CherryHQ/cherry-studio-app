# Editable Image Preview Requests

This app-shell boundary carries a caller-owned replacement callback across the shared file-viewer
route. The route receives only a random request id plus the initial file id; ordinary file links
remain read-only. A request is valid for one source owner and tracks the currently accepted image
so an earlier edit cannot replace a later result.

The source owner registers through `useImagePreviewEditRequest`. Disposal aborts pending image work.
The viewer claims the request and schedules disposal when it unmounts, allowing strict-effect
remounts to reclaim it. Navigation that never opens a viewer expires after 30 seconds.

The viewer owns editor state and file persistence. The callback only accepts/rejects a completed
replacement; the composer checks its attachment id and expected managed file id synchronously,
preserving position and unrelated draft state. A rejected derivative is discarded by the viewer.

The file library registers from its list container, above recycled rows and tiles. It accepts each
saved derivative as a new library entry and advances the viewer to that version; no attachment
reference or original file is replaced. File change subscriptions refresh the library.
