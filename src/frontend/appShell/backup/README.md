# Backup Startup Surface

Owns the app-wide restart boundary after a replacement restore is staged or activation fails.
`BackupDialog` is the single surface for a backup or restore. While work runs it blocks every route
and the user can only wait or cancel; the same dialog then asks the user to save the finished export (counts,
Save to Files, Share, Cancel; Cancel discards the unsaved archive) or the restore preview (source, counts, Restore, Cancel). The preview is the
restore confirmation. `useBackupErrorReporter` maps backup errors to toasts for both entry points.
The bootstrap gate removes the application routes while the current process must stay read-only.
Settings owns starting an export and archive selection; backend backup/storage owners own data.
On Android, the screen requests a native process restart and falls back to manual instructions if
the helper is unavailable or does not complete. iOS shows the manual instructions. Neither path
treats a JavaScript reload as a native process restart.
`RestoreOutcomeNotice` reports once, on the boot that settles a restore, whether it was applied
or rolled back to the previous data.
