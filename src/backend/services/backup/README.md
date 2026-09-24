# Local backup and replacement restore

Tracks [issue #1060](https://github.com/CherryHQ/cherry-studio-app/issues/1060).
`BackupRuntime` owns operations, cancellation, progress and candidate lifetime. It is exposed as
`Backend.backup`; the settings screen only chooses files, renders progress and requests confirmation.

## Portable format v1

A streaming ZIP contains `manifest.json`, `database/cherry.db`, `files/<id>.<ext>` and
`avatars/{user,agents,providers}/<name>`. The manifest records product/version, migration SQL hashes,
counts, relative paths, byte sizes and SHA-256 hashes. Every referenced resource is present. The whole database preserves
chats, agents, settings, provider keys, tool bindings, paintings and file metadata.

This is a mobile format. Desktop physical backups are rejected. Compatibility requires an exact
prefix of bundled SQLite migrations; different migration lineage, future formats and unknown schema
objects are rejected. Custom SQL triggers are excluded from the structure comparison because restore
normalization and `DbService` recreate them from the running bundle.

Archives are unencrypted and include database-held model keys and remote server headers. They exclude
SecureStore values, desktop pairing tokens, device permissions, caches, logs and extracted documents.
System sharing presents save destinations; opening or dismissing the share sheet is not proof of
successful saving.

## Export

While a backup or restore runs, an app-wide progress dialog blocks every route; the user can only
wait or cancel. Capture refuses active chat/job execution, and a freeze keeps new Agent turns and
background jobs from starting while the SQLite backup API snapshots the database (including WAL
data) and managed resources are copied. Jobs resume before compression. Missing original files fail
export rather than silently producing an incomplete full backup.

Hashing is native and streaming; ZIP processing uses bounded chunks. Limits are 1 GiB compressed,
1 GiB expanded and 10,000 payload entries, with a 4 MiB manifest. Free space is checked while copying
and extracting. Cancellation removes work owned by the operation before activation is committed.

## Restore

Selection reads the chosen archive in place, validates the ZIP central directory and paths, extracts
to app-owned cache, checks payload sizes and hashes, compares the actual SQLite structure against a database built from bundled SQL,
then runs integrity/reference checks. Duplicate and case-colliding paths, traversal, encryption,
symlinks, unexpected payloads, expansion limits and truncated archives fail before live data changes.

Confirmation moves the verified payloads into a new generation, so a failed attempt requires
selecting the backup again. Its database cancels unfinished
jobs, marks partial replies interrupted, drops desktop pairing, rotates plugin credential references
without copying their secret values, and retains the target device's identity/privacy/onboarding/
background-notification preferences. Other settings and content come from the backup. Plugin rows
and their tool bindings remain so users can reconnect them.

After durable staging, Android restarts the native process automatically. iOS and Android clients
without a working restart helper ask the user to completely close and reopen the application. The
[storage generation controller](../../data/storage/README.md) commits only after required bootstrap
succeeds and rolls back interrupted activation. The first boot that settles a restore reports once
whether it was applied or rolled back. Import does not merge records or replay prior tasks.

WebDAV/S3, scheduled backups, encryption, partial restore and desktop interchange are outside v1.

## Verification

Focused suites cover mutation admission, runtime progress state, serialized paths and limits, ZIP
truncation/encryption, native-process state transitions, custom trigger comparison and SQLite
normalization/rollback. Device acceptance must also
exercise export/save/import on both platforms, cancellation, low disk, native termination during
each restore phase, and the native module's durability. Those checks and native builds are not
implied by editing this code.
