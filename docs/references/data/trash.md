# File Trash

The trash retains user-deleted library files for 30 days. The library's More menu opens `/trash`,
which presents Recently deleted as compact thumbnail/name/days-left rows beneath one notice with the
retention period and total trashed file size. Tapping a row opens Restore and Permanently delete;
the header menu offers Empty trash. Trash image thumbnails resolve only the matching deletion
timestamp; ordinary file reads and attachments remain unavailable until restoration. Local Session
deletion remains immediate and does not move attachments to trash.

## Data And Operations

There is no duplicate trash table. `file_entry.deletedAt` owns recoverable membership.
`TrashService` projects trashed rows into one cursor stream, ordered by deletion time and file id.

- Library deletion uses `FileModule.moveToTrash`. Normal file reads, Agent attachment/edit paths,
  and previews treat trashed files as unavailable. Restore clears the deletion mark, keeping the
  entry id and content/preview revision. Historical references work again when their file is restored.
  Draft rewrites check availability and write bytes and metadata within the same serialized database
  transaction as trash mutations, so a queued deletion cannot split those writes.
- Restore and permanent deletion act on one file. Emptying the whole trash requires confirmation;
  one failure does not stop other files from being emptied.
- Permanent file removal reuses `deleteInternalEntry`: remove the row, then unlink bytes and preview
  best-effort. A leftover blob belongs to orphan-blob sweeping, not the trash.
- Cancelling imports or discarding temporary edits remains immediate hard cleanup, outside the trash.

## Lifetime And Backup

`TrashRuntime` captures its host's database, serializes restore/delete/empty/sweep operations, and
joins pending work on stop. It sweeps once on startup and on foreground entry. Only files whose
`deletedAt` is strictly older than 30 days qualify for permanent removal. Permanent removal rechecks
the captured deletion time inside the write transaction so restoring a file wins over stale cleanup.
There is no timer, scheduled job, or background-task registration.

The backup mutation gate blocks trash mutations, and backup admission considers pending trash work.
Backups already include the full Cherry database and every referenced library blob, including
trashed records with their original deletion time. After a backup restore and restart, the startup
sweep removes expired files. Cache thumbnails are derived and are regenerated as needed.
