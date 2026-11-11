# Sharing Entry

`useDocumentExport().open` freezes a document and `useShareFiles().share` freezes an ordered file
collection. `useShareFile` is the single-file entry. Both use `/share`; navigation carries only a
request ID, never content or callbacks. The request admits one panel at a time and expires if its
route never claims it.

The source owns selection. The panel previews that fixed collection and has no adjustment or
selection controls. Closing and reopening from the source creates a fresh request. Closing the
system share chooser leaves the panel open; it never claims recipient delivery.

Sharing initializes its watermark from the global setting. Users choose watermark only in global
settings; sharing panels expose no watermark control. Original bitmap shares use the resolved
style as well; other original files retain their bytes. Local saving always uses an unwatermarked artifact,
independently of the share preview. The global preference is unchanged.
File-library entry points use `useShareFiles({ allowConversion: false })`. The frozen request keeps
that policy, so single files and all-HTML selections expose no format-conversion choices. Sharing
watermark treatment still applies to bitmap copies.

`retainShareOperation` holds source bytes through physical capture, copies and external delivery.
`registerShareCleanup` registers temporary conversion artifacts. Closing waits for in-flight work,
then disposes artifacts and document sessions before admitting the next request. The backend
runtime is the application-shutdown backstop. OS-readable delivery copies may outlive the panel.

`features/sharing` owns the shared BottomSheet, preview and capture strategy. `Backend.documentExport`
owns generation and explicit persistence. `appShell/fileExport` owns stable delivery copies, system
sharing and Photos permission handling.
