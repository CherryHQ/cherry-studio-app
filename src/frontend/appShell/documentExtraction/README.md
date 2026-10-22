# Document Extraction Notice

`PdfOcrNotice` owns the app-wide, nonblocking OCR activity notice shared by attachment preparation
and Agent file reads. It subscribes through the file backend contract, delays short operations to
avoid flashing, and hides the persistent toast on completion or unmount. Its text child subscribes
to completed/total pages so progress does not recreate the toast. The subscription is passed through
props because the toast host sits above the backend provider. A separate warning identifies pages
where successful OCR produced no text; it fires on first extraction only, not on cached history
re-reads. No filenames or extracted content enter this state.
Cancellation stays with the original send/tool operation's Stop action.
