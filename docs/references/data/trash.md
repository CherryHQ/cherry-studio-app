# File Trash

The trash retains user-deleted library files, versions, and folders for 30 days. The library's More menu opens `/trash`,
which presents Recently deleted as compact thumbnail/name/days-left rows beneath one notice with the
retention period and total trashed file size. Tapping a row opens Restore and Permanently delete;
the header menu offers Empty trash. Trash image thumbnails resolve only the matching deletion
timestamp; ordinary file reads and attachments remain unavailable until restoration. Local Session
deletion remains immediate and does not move attachments to trash.

## Data And Operations

There is no duplicate trash table. `file_folder.deletedAt`, `library_file.deletedAt`, and
`file_entry.deletedAt` own recoverable membership. `trashedWith` groups descendants and versions.
`TrashService` projects root items into one cursor stream, ordered by deletion time and `kind:id`.
File thumbnails use the logical file's current version; individual versions use their own entry id.
Folders display a folder icon.

- `TrashRuntime` owns trashing for the library screen (`FileModule.moveToTrash` and folder
  `DELETE`) and Agent tools, notifying file subscribers after commit. Normal file reads, Agent
  attachment/edit paths, and previews treat trashed files as unavailable. Restore clears the deletion mark, keeping the
  entry id and content/preview revision. Historical references work again when their file is restored.
  Draft rewrites check availability and write bytes and metadata within the same serialized database
  transaction as trash mutations, so a queued deletion cannot split those writes.
- Restore and permanent deletion act on one item and its grouped versions. Emptying the whole trash requires confirmation;
  one failure does not stop other files from being emptied.
- Permanent file removal commits the group's metadata removal atomically, then reuses
  `deleteInternalEntryFiles` to unlink bytes and previews best-effort. A leftover blob belongs to orphan-blob sweeping, not the trash.
- Cancelling imports or discarding temporary edits remains immediate hard cleanup, outside the trash.

## Lifetime And Backup

`TrashRuntime` captures its host's database, serializes restore/delete/empty/sweep operations, and
joins pending work on stop. It sweeps once on startup and on foreground entry. Only items whose
`deletedAt` is strictly older than 30 days qualify for permanent removal. Permanent removal rechecks
the captured deletion time inside the write transaction so restoring an item wins over stale cleanup.
There is no timer, scheduled job, or background-task registration.

The backup mutation gate blocks trash mutations, and backup admission considers pending trash work.
Backups already include the full Cherry database and every referenced library blob, including
trashed records with their original deletion time. After a backup restore and restart, the startup
sweep removes expired items. Cache thumbnails are derived and are regenerated as needed.

Trashing a logical file includes every version. Trashing a folder includes its active subtree and
those files' versions as one item; separately trashed subtrees stay independent. Users may also
trash old versions individually. Restore reactivates the group, retaining content revision keys;
when the former parent is unavailable, the restored root moves to the library root with a collision
suffix if needed. Permanent folder deletion clears Session bindings. Deleting a Session leaves its
workspace folder and files intact.
