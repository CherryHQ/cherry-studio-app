# Backup Startup Surface

Owns the app-wide restart boundary after a replacement restore is staged or activation fails.
`BackupProgressGate` blocks every route with a progress dialog while a backup or restore runs; the
user can only wait or cancel.
The bootstrap gate removes the application routes while the current process must stay read-only.
Settings owns archive selection, progress and confirmation; backend backup/storage owners own data.
On Android, the screen requests a native process restart and falls back to manual instructions if
the helper is unavailable or does not complete. iOS shows the manual instructions. Neither path
treats a JavaScript reload as a native process restart.
`RestoreOutcomeNotice` reports once, on the boot that settles a restore, whether it was applied
or rolled back to the previous data.
