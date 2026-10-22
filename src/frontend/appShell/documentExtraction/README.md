# Document Extraction Notice

`PdfOcrNotice` owns the app-wide, nonblocking OCR activity notice shared by attachment preparation
and Agent file reads. It subscribes through the file backend contract, delays short operations to
avoid flashing, and hides the persistent toast on completion or unmount. No filenames or extracted
content enter this state. Cancellation stays with the original send/tool operation's Stop action.
