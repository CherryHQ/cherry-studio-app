# Backup Startup Surface

Owns the app-wide restart boundary after a replacement restore is staged or activation fails.
The bootstrap gate removes the application routes while the current process must stay read-only.
Settings owns archive selection, progress and confirmation; backend backup/storage owners own data.
The screen does not force-exit the app or treat a JavaScript reload as a native process restart.
