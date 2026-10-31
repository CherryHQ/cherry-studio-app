# Verified File Downloads

`downloadFile` is the shared HTTP file-transfer boundary for APK updates and offline voice models.
It uses Expo FileSystem's native downloader and the shared native SHA-256 reader, so large files
are never buffered on the JavaScript thread. Ordinary metadata requests still use `HttpClient`.

Callers supply an HTTPS URL, a private local destination, an expected SHA-256, a size ceiling,
an optional exact byte count, a timeout and an abort signal. Progress is throttled and separates
transfer from verification. A cached destination is reused only after size/hash verification.
Only verified temporary files are moved to the destination; concurrent writes to one destination
are rejected. Cancellation joins native cleanup and removes the partial file before settling.

Domains own storage directories, active-job deduplication, retry/mirror choices, subscriptions,
deletion and disposal. Closing a screen need not cancel a transfer; shutting down its owner must
abort and await it. Retries reuse completed verified files and restart the interrupted file.
There is no background execution lease or automatic restart after process death.
