# Backup settings

The route exposes local full export and replacement restore through `Backend.backup`. This page
only starts an export and selects an archive to restore; the app-wide `BackupDialog` in
`appShell/backup` shows progress, the finished export with Save to Files and Share, and the restore
preview that doubles as the destructive confirmation.
The backend owns validation, operation lifetime and storage transitions. The app bootstrap gate
owns the global restart surface after durable staging.
