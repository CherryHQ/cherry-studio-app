# File Model

> Status: as-built.

How Cherry Mobile stores user- and generation-owned files. This model is mobile-native and
deliberately diverges from Cherry Desktop's `FileEntry`: desktop's external-path entries, content
hashing, cleanup policies, and entry-level trash have no mobile consumer, so none of them exist
here. Terms follow [Domain Language](../domain-language.md).

## Invariants

1. **Files are first-class.** A file is a peer of the Agent message or painting that uses it, not a
   dependent of it. Every entry belongs in the file library.
2. **Content is immutable.** Bytes never change after creation. Any "edit" creates a new entry
   (copy-on-write); nothing in the app rewrites a managed blob in place.
3. **Cherry owns every blob.** Picker, camera, and provider URIs are transient import sources whose
   bytes are copied into `Data/Files`. No entry references a path outside the sandbox.
4. **Import happens when the file enters the app.** Painting imports at generation time; the Agent
   Composer imports when an attachment enters its managed draft.
5. **Business-object deletion never deletes files.** Deleting an Agent Session or painting leaves
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
`updatedAt`, `deletedAt`, `provenance`.

- `mediaType` is the IANA media type captured at import — picker metadata first, Expo's
  extension-derived `File.type` second, `application/octet-stream` last. It is authoritative for
  every consumer; nothing re-infers a type from the extension. It is also the filter key for the
  library's category tabs (`image/%`, `application/pdf`, …), which is why extensions are not stored
  separately.
- `updatedAt` equals `createdAt` on insert and has no writer today. A future metadata update
  (library rename) is its first one; immutable content means it never tracks a content write.
- `provenance` is stable source identity: `imported` for a file brought in from a picker, camera,
  paste, or painting input; `generated` for a file written or produced for the user by Cherry;
  `unknown` when nothing proves either. Reattaching a generated file as an input does not change its
  origin. It is written exactly once, by whoever creates the bytes, and never derived from an owner
  at read time — owners are deleted, and the library still has to answer.

  `unknown` is a real state, not a gap waiting to be filled. Rows that predate the column, and rows
  that will arrive from a peer with no provenance concept of its own, have no proven origin;
  recording them as `imported` would state something the data does not support. The library shows a
  badge only for `generated` and stays silent otherwise, so the three states cost one label rather
  than three.
- `deletedAt` is reserved for the future library trash. It is `NULL` for every production row today;
  attachment admission and direct preview reads already treat a marked row as unavailable, while
  cleanup still must not infer ownership from it.

## Ownership

An owner stores the entry ids it points at, inside its own row:

| Owner | Where the ids live |
| --- | --- |
| Painting | `painting.files` — `{ input: string[], output: string[] }` |
| Agent message | `agent_session_message.data.parts[].fileEntryId` |

`write_file` and `edit_file` tool results each carry the `fileEntryId` they created in result JSON.
The Runtime projects the same id as a `purpose: 'artifact'` file part directly after its tool part;
chat lifts file parts out of the ordered stream and shows them after the answer, where deliverables
are easier to find than at the step that produced them. As with every owner here, the reference
outlives the bytes and degrades to the unavailable placeholder.

`purpose` and `provenance` answer different questions and neither substitutes for the other.
`purpose` is a fact about a file's role *in one message*, travels in the transcript, and is read by
turn preparation to decide what gets replayed to the model; presentation does not read it.
`provenance` is a fact about the *bytes*, survives every owner, and is what the library reports.

There is no association table and no foreign key from an owner to `file_entry`. That is the point:
a foreign key would have to choose between `CASCADE` (deleting a file silently rewrites the
receipts that referenced it) and `RESTRICT` (a file the user asked to delete cannot be deleted).
Both contradict the model — the id stays, the bytes go, and the surface renders the unavailable
placeholder. Writers validate ids against `file_entry` at write time (`assertFileEntriesExistTx`
for paintings), which catches the mistake that actually happens: pointing at an entry that was
never created.

## Agent Attachment Persistence

A persisted Agent file part stores `fileEntryId` plus Host-validated display metadata such as name
and media type — never an absolute sandbox path, which iOS invalidates on container relocation. The
Host verifies the live entry and managed blob before reserving a current submission. If the entry or
its bytes later disappear, the part remains in history and renders unavailable. For images, the Host
accepts only the shared AI image whitelist, validates the selected model and Pi endpoint before
reservation, and converts managed bytes to a bounded temporary Data URL for the active request. For
text, the Host accepts an explicit text/source allowlist, validates bounded managed bytes as strict
UTF-8, and projects a bounded structured Runtime part that Pi JSON-escapes as untrusted user
content. A leading UTF-8 BOM is accepted and stripped; NUL, binary controls, invalid UTF-8, and
unsupported binary media types fail closed before reservation. Extracted text remains request-local
and is never persisted.

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

**Missing bytes** — a current submission fails before admission; an already-persisted reference
survives, the UI renders the "unavailable" placeholder, and later model history omits its content
without failing the turn. Nothing silently removes a historical reference.

## Out of scope, deliberately

The avatar is a settings value, not a document: it lives at
`{documentDirectory}/user-avatar/{uuid}.webp` with the preference holding
`avatar-file:{uuid}.webp`, outside `file_entry` so it never appears in the file library. Provider
logos are similarly external (`{documentDirectory}/provider-avatars/`, resolved by directory listing)
— a known exemption, not a model to copy.

## Extension points

**File library.** The library page is a query over `file_entry`; it needs no new table. A tile badges
its `provenance` only when the origin is `generated`. Filtering by origin is deliberately not shipped
yet: most historical rows are `unknown`, so the filter would sort noise until enough labelled rows
exist. Its future trash uses
the reserved `deletedAt`: delete sets it, restore clears it, emptying the trash hard-deletes rows and
bytes, and other surfaces then show the unavailable placeholder. There is no retention timer —
trashed files persist until the user empties the trash. Deleting is deliberately unguarded: no
"used by 2 Sessions" warning, because that would need the reverse index this model does without, and
the user owns the consequences of their own deletion. The same iteration owns a cache-cleanup
action, which is also where orphan-blob sweeping belongs (blobs in `Data/Files` with no matching
row).

**Agent file writes and generated artifacts.** `write_file` stores bounded UTF-8 text through the
`'text'` source of `createInternalEntry`. `edit_file` strictly decodes a bounded UTF-8 source
selected by active `fileEntryId`, applies exact replacement, and creates a same-name,
same-media-type copy through the same text boundary. Both persist the new entry with
`provenance: 'generated'` and return it in the Runtime artifact envelope; `generate_image` likewise
imports generated image bytes with generated provenance. `write_file` reads no entry and does not
consult the turn resource ledger. Knowledge of a valid id is sufficient for `edit_file` even outside
that ledger, but it exposes no file listing or search. Neither tool rewrites a managed blob.

Office inputs are imported before inspection or editing, and every edit patches a copy into a new
entry while preserving the source. Office and image tools follow the same rule for newly generated
output. The file library is also the Version 1 artifact library; no parallel artifact blob store or
external authoritative path exists. Raw picker, provider, and device URIs are transient import
sources; Agent protocol and tools receive only managed ids.

The Runtime projects each result into an assistant-message file part containing its `fileEntryId`
and `purpose: 'artifact'`, because a file id sitting only in tool-result JSON is not transcript
ownership. That reference remains available to UI and, while the managed entry exists, controlled
tools, but is not automatically sent to the model as a file attachment in later history. The
originating paired tool result retains bounded reference metadata without inlining its content.
Explicit user attachment produces an `input-attachment` part for the same entry; controlled
inspection and read tools can also consume it by id. See
[Agent Tools And Controlled Resources](../agent/agent-tools-and-resources.md#tool-results-and-artifacts).

Saving or sharing a managed artifact to the system copies its bytes to a user-selected destination.
The managed entry remains canonical, and Cherry never persists the exported path as file authority.

**Provider upload cache.** A separate table keyed by content hash, added when the AI SDK's Files
Upload API stabilizes.
