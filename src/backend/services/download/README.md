# File Downloads

`downloadFile` is the shared HTTP file-transfer boundary for APK updates, offline voice models and
private conversation archives.
It uses Expo FileSystem's native downloader and the shared native SHA-256 reader, so large files
are never buffered on the JavaScript thread. Ordinary metadata requests still use `HttpClient`.

Asset callers supply an HTTPS URL, a private local destination, an expected SHA-256, a size ceiling,
an optional exact byte count, a timeout and an abort signal. Progress is throttled and separates
transfer from verification. A cached destination is reused only after size/hash verification.
Only verified temporary files are moved to the destination; concurrent writes to one destination
are rejected. Cancellation joins native cleanup and removes the partial file before settling.

An archive without a publisher-provided checksum must explicitly select `validation: 'caller'`.
It still has bounded native transfer, timeout and joined cancellation, but never reuses a cached
file or claims checksum verification. Its destination remains private and its owning domain must
validate the downloaded container and content before publishing application data. DeepSeek import
uses this mode with URL admission followed by bounded ZIP/CRC and conversation-schema validation.
APK and model callers retain mandatory SHA-256 verification.

Domains own storage directories, active-job deduplication, retry/mirror choices, subscriptions,
deletion and disposal. Closing a screen need not cancel a transfer; shutting down its owner must
abort and await it. Retries reuse completed verified files and restart the interrupted file.
There is no background execution lease or automatic restart after process death.
