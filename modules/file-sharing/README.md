# File Sharing

Local Expo module for presenting ordered local files in one system share sheet. Single-file
delivery continues to use `expo-sharing`; `FileEntryPreview.shareFiles` owns readable copies under
the OS cache's `FileExports` directory and retains them after dismissal for late recipient reads.

iOS supplies all file URLs to `UIActivityViewController` and resolves on any dismissal. Android
uses `ACTION_SEND_MULTIPLE`, an ordered URI list, `ClipData`, and temporary read grants. Its private
`FileProvider` exposes only `FileExports`, and input paths must resolve beneath that directory.
See Android's [multiple-content sharing](https://developer.android.com/develop/ui/compose/sharing/send)
and [FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider) contracts.
Neither platform's completion means the recipient received the files.

A native development-client rebuild is required to include this module. This change has not been
built or accepted on a device.
