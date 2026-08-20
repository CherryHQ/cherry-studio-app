# File Model

Status: as-built.

How Cherry Mobile stores user- and generation-owned files. This model is mobile-native and
deliberately diverges from Cherry Desktop's `FileEntry`: desktop's external-path entries, content
hashing, cleanup policies, and entry-level trash have no mobile consumer, so none of them exist
here. Terms follow [Domain Language](../domain-language.md).

## Invariants

1. **Files are first-class.** A file is a peer of the message or painting that uses it, not a
   dependent of it. Every entry belongs in the future file library.
2. **Content is immutable.** Bytes never change after creation. Any "edit" creates a new entry
   (copy-on-write); nothing in the app rewrites a managed blob in place.
3. **Cherry owns every blob.** Picker, camera, and provider URIs are transient import sources whose
   bytes are copied into `Data/Files`. No entry references a path outside the sandbox.
4. **Import happens when the file enters the app.** The composer imports at pick time (the upload
   affordance tells the user the file is stored), painting imports at generation time.
5. **Business-object deletion never deletes files.** Deleting a topic, message, or painting leaves
   every file it pointed at in place.
6. **Only the user deletes files.** Two paths exist: cancelling an attachment before send, and (once
   the file library ships) library deletion. There is no background garbage collection.
7. **Owners hold their own file ids; there is no association table.** A message carries them in its
   part JSON, a painting in its `files` column. Nothing maintains a reverse index, because nothing
   asks which owners use a given file — and a file outlives every owner that pointed at it.

## Storage

| Concern | Rule |
| --- | --- |
| Blob location | `{documentDirectory}/Data/Files/{id}{.ext}` |
| Path persistence | Never persisted. `fileStorage` rebuilds the absolute path per call from the id plus the extension derived from `filename`, so iOS container relocation cannot invalidate it. |
| Extension source | `filenameExtension(filename)`; an extension failing `SafeExtSchema` is folded back into the stored name so the row and the on-disk suffix always agree. |
| Path safety | `managedFile` parses the id and extension before composing a path; nothing else may compose one. |

## Schema

`file_entry`: `id`, `filename` (including extension), `mediaType`, `size`, `createdAt`,
`updatedAt`, `deletedAt`.

- `mediaType` is the IANA media type captured at import — picker metadata first, Expo's
  extension-derived `File.type` second, `application/octet-stream` last. It is authoritative for
  every consumer; nothing re-infers a type from the extension. It is also the filter key for the
  library's category tabs (`image/%`, `application/pdf`, …), which is why extensions are not stored
  separately.
- `updatedAt` equals `createdAt` on insert and has no writer today. A future metadata update
  (library rename) is its first one; immutable content means it never tracks a content write.
- `deletedAt` is reserved for the future library trash. It is `NULL` for every row today, no code
  branches on it, and no cleanup logic may consult it.

## Ownership

An owner stores the entry ids it points at, inside its own row:

| Owner | Where the ids live |
| --- | --- |
| Chat message | `message.data` JSON — `fileEntryId` in each file part's Cherry metadata |
| Painting | `painting.files` — `{ input: string[], output: string[] }` |

There is no association table and no foreign key from an owner to `file_entry`. That is the point:
a foreign key would have to choose between `CASCADE` (deleting a file silently rewrites the
receipts that referenced it) and `RESTRICT` (a file the user asked to delete cannot be deleted).
Both contradict the model — the id stays, the bytes go, and the surface renders the unavailable
placeholder. Writers validate ids against `file_entry` at write time (`assertFileEntriesExistTx`
for paintings), which catches the mistake that actually happens: pointing at an entry that was
never created.

## Message persistence

A persisted file part stores `url: "cherry://file/{id}"` plus `fileEntryId` in its Cherry metadata —
never an absolute sandbox path, which iOS invalidates on container relocation. Consumers resolve the
id to a device URI at read time (`FileEntryPreview` for rendering, `fileProcessor` for AI requests).
A bare `file://` / `content://` URL is only accepted for a part that carries no id, i.e. one that has
not been imported yet.

Attachments are sent to providers as inlined base64 data URLs. The provider upload cache is deferred
until the AI SDK's Files Upload API leaves pre-release; its content hash belongs to that cache table,
not to `file_entry`.

## Lifecycle

**Create** — write bytes to `Data/Files`, then insert the row. A failed insert unlinks the bytes it
just wrote. A crash between the two leaves an orphan blob, reclaimable by the future cache-cleanup
sweep.

**Delete** — `deleteInternalEntry` removes the row inside a write transaction, then unlinks the
bytes best-effort. Row first: a leftover blob is reclaimable, a dangling row is not. The composer
calls it when the user cancels an attachment; the future library calls it when the user empties the
trash.

**Missing bytes** — the row survives and the UI renders the "unavailable" placeholder; the AI request
drops that attachment rather than failing the turn. History stays intact; nothing silently removes a
reference.

## Out of scope, deliberately

The avatar is a settings value, not a document: it lives at
`{documentDirectory}/user-avatar/{uuid}.webp` with the preference holding
`avatar-file:{uuid}.webp`, outside `file_entry` so it never appears in the file library. Provider
logos are similarly external (`{documentDirectory}/provider-avatars/`, resolved by directory listing)
— a known exemption, not a model to copy.

## Extension points

**File library.** A library page is a query over `file_entry`; it needs no new table. Its trash uses
the reserved `deletedAt`: delete sets it, restore clears it, emptying the trash hard-deletes rows and
bytes, and other surfaces then show the unavailable placeholder. There is no retention timer —
trashed files persist until the user empties the trash. Deleting is deliberately unguarded: no
"used by 2 topics" warning, because that would need the reverse index this model does without, and
the user owns the consequences of their own deletion. The same iteration owns a cache-cleanup
action, which is also where orphan-blob sweeping belongs (blobs in `Data/Files` with no matching
row).

**Agent file writes.** A write tool reads the current entry, creates a new one, and returns the new
id; it must not rewrite a managed blob. Agent-owned files are stored the way every other owner
stores them — ids on the owning row — not in an association table. A file id sitting in a
tool-result JSON payload is not ownership: it has to reach a row that outlives the turn, or the
file has no owner at all.

**Provider upload cache.** A separate table keyed by content hash, added when the AI SDK's Files
Upload API stabilizes.
