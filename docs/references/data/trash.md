# File Trash

The trash retains user-deleted library files for 30 days. `/trash` presents Recently deleted as
compact thumbnail/name/date rows beneath one retention notice. Tapping a row opens Restore and
Permanently delete; the header menu offers Empty trash. Both the library menu and Settings → Storage
open this page. Storage settings also show trashed file bytes. Trash image thumbnails resolve only
the matching deletion timestamp; ordinary file reads and attachments remain unavailable until
restoration. Local Session deletion remains immediate and does not move attachments to trash.

## Data And Operations

There is no duplicate trash table. `file_entry.deletedAt` owns recoverable membership. Permanent
file deletion moves its metadata into a `file-cleanup:<id>` receipt in the existing `app_state`
journal, in the same transaction that removes the file row. `TrashService` projects records and
pending receipts into one cursor stream, ordered by deletion time and file id.

- Library deletion uses `FileModule.moveToTrash`. Normal file reads, Agent attachment/edit paths,
  and previews treat trashed files as unavailable. Restore clears the deletion mark, keeping the
  entry id and content/preview revision. Historical references work again when their file is restored.
  Draft rewrites check availability and write bytes and metadata within the same serialized database
  transaction as trash mutations, so a queued deletion cannot split those writes.
- Restore and permanent deletion act on one file. Emptying the whole trash requires confirmation.
- Permanent file removal reuses `deleteInternalEntry`: commit ownership removal and its cleanup
  receipt, then unlink bytes and preview, and finally clear the receipt. Failures are reported and
  keep a non-restorable pending item in the trash. Its file bytes remain conservatively counted until
  cleanup completes. Permanent delete and Empty trash retry these items; one failure does not stop
  other files from being emptied. A crash at either boundary leaves an idempotent retry for the next
  sweep.
- Cancelling imports or discarding temporary edits remains immediate hard cleanup, outside the trash.

## Lifetime And Backup

`TrashRuntime` captures its host's database, serializes restore/delete/empty/sweep operations, and
joins pending work on stop. It sweeps once on startup and on foreground entry. Only files whose
`deletedAt` is strictly older than 30 days qualify for new permanent removal. Already committed
cleanup receipts are retried regardless of age. Permanent removal rechecks the captured deletion
time inside the write transaction so restoring a file wins over stale cleanup. There is no timer,
scheduled job, or background-task registration.

The backup mutation gate blocks trash mutations, and backup admission considers pending trash work.
Backups already include the full Cherry database and every referenced library blob, including
trashed records with their original deletion time. After a backup restore and restart, the startup
sweep removes expired files. Cache thumbnails are derived and are regenerated as needed.
Cleanup receipts are journaled in the database but do not make deleted blobs required backup
resources. After backup restoration, missing blobs and previews satisfy their cleanup receipts.
