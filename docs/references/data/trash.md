# Unified Trash

The trash retains user-deleted local Agent Sessions and library files for 30 days. `/trash` presents
Recently deleted as compact thumbnail/name/date rows beneath one retention notice. Tapping a row
opens Restore and Permanently delete; the header menu owns All, Sessions, and Files filters and
category-scoped emptying. The library menu opens Files; Settings → Storage shows trashed file bytes
and opens the unified page. Trash image thumbnails resolve only the matching deletion timestamp;
ordinary file reads and attachments remain unavailable until restoration.

## Data And Operations

There is no duplicate trash table. `agent_session.deletedAt` and `file_entry.deletedAt` own
recoverable membership. Permanent file deletion moves its metadata into a `file-cleanup:<id>`
receipt in the existing `app_state` journal, in the same transaction that removes the file row.
`TrashService` projects records and pending receipts into one cursor stream, ordered by deletion time
and `kind:id` so cross-table id collisions cannot skip entries. Category filters run in SQL.

- Session deletion continues through `MobileAgentHost`: cancel admission/execution, drain settlement
  and usage, mark the Session, increment its runtime revision, and retire its working copy. Messages,
  checkpoints, activity time, and fork lineage stay in Cherry. Trashed Sessions are excluded from
  normal listing, title/content search, transcript export, and execution admission.
- Library deletion uses `FileModule.moveToTrash`. Normal file reads, Agent attachment/edit paths,
  and previews treat trashed files as unavailable. Restore clears the deletion mark, keeping the
  entry id and content/preview revision. Historical references work again when their file is restored.
  Draft rewrites check availability and write bytes and metadata within the same serialized database
  transaction as trash mutations, so a queued deletion cannot split those writes.
- Restore and permanent deletion act on one item. Emptying the current category or the whole trash
  requires a confirmation naming its scope. Session restoration never restores separately deleted
  files; deleting or permanently removing a Session never removes its independent attachments.
- Permanent Session removal cascades messages and clears source/boundary metadata in surviving
  forks. File removal reuses `deleteInternalEntry`: commit ownership removal and its cleanup receipt,
  then unlink bytes and preview, and finally clear the receipt. Failures are reported and keep a
  non-restorable pending item in the trash. Its file bytes remain conservatively counted until cleanup
  completes. Permanent delete and Empty trash retry these items; one failure does not stop other
  items from being emptied. A crash at either boundary leaves an idempotent retry for the next sweep.
- Sidebar batch deletion hides rows only until its catalog refresh finishes. Restored Sessions use
  their original ids and are not masked by old selection state.
- Cancelling imports or discarding temporary edits remains immediate hard cleanup, outside the trash.

## Lifetime And Backup

`TrashRuntime` captures its host's database, serializes restore/delete/empty/sweep operations, and
joins pending work on stop. It sweeps once on startup and on foreground entry. Only items whose
`deletedAt` is strictly older than 30 days qualify for new permanent removal. Already committed
cleanup receipts are retried regardless of age. Permanent removal rechecks the captured deletion
time inside the write transaction so restoring an item wins over stale cleanup. There is no timer,
scheduled job, or background-task registration.

The backup mutation gate blocks trash mutations, and backup admission considers pending trash work.
Backups already include the full Cherry database and every referenced library blob, including
trashed records with their original deletion time. After a backup restore and restart, the startup
sweep removes expired items. Cache thumbnails are derived and are regenerated as needed.
Cleanup receipts are journaled in the database but do not make deleted blobs required backup
resources. After backup restoration, missing blobs and previews satisfy their cleanup receipts.

Folders and version-history grouping are owned by issue #1281, which can extend these deletion and
restore operations once those records exist. The current trash contains individual library entries
and whole local Sessions.
