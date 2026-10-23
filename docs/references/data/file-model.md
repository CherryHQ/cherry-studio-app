# File Model

> Status: as-built.

How Cherry Mobile stores user- and generation-owned files. This model is mobile-native and
deliberately diverges from Cherry Desktop's `FileEntry`: desktop's external-path entries, content
hashing, and per-file cleanup policies have no mobile consumer. Mobile uses the
[file trash](./trash.md) for recoverable user deletion. Terms follow [Domain Language](../domain-language.md).

## Invariants

1. **Files are first-class.** A file is a peer of the Agent message or painting that uses it, not a
   dependent of it. Every entry belongs in the file library.
2. **Content is immutable once its turn ends.** An entry produced by an Agent turn is that turn's
   draft and may be rewritten in place by the same turn's `edit_file` or `write_file`; the moment the turn ends,
   or for any entry the turn did not produce, bytes never change and an "edit" creates a new
   version entry. Nothing else in the app rewrites a managed blob.
3. **Cherry owns every blob.** Picker, camera, and provider URIs are transient import sources whose
   bytes are copied into `Data/Files`. No entry references a path outside the sandbox.
4. **Import happens when the file enters the app.** Painting imports at generation time; the Agent
   Composer imports when an attachment enters its managed draft. Import is also the only place an
   image is resized: a user-imported JPEG, PNG, or WebP above about 2.2 MB, far below the strictest
   provider per-image limit because every request replays the conversation's images, is re-encoded
   once to a 2048-pixel long edge (an oversized PNG becomes a JPEG and is renamed to match), so the
   managed blob is already what a model request can carry and no request path compresses, caches a
   derivative, or retries on a provider size error. GIFs, generated images, and images that cannot
   be re-encoded are stored untouched; send-time attachment limits remain their guard.
5. **Business-object deletion never deletes files.** Deleting an Agent Session or painting leaves
   every file it pointed at in place.
6. **The user decides which files to delete.** Removing a composer attachment removes its reference,
   not the library entry. Library deletion moves the file to trash for 30 days. The user may
   permanently delete it sooner; the app removes expired trash on startup and foreground entry.
7. **Owners hold their own file ids; there is no association table.** A message carries them in its
   part JSON, a painting in its `files` column. Nothing maintains a reverse index; the one reverse
   question asked — which painting produced an image the library opens — is answered by scanning
   painting outputs, and a file outlives every owner that pointed at it.

## Storage

| Concern | Rule |
| --- | --- |
| Blob location | `{documentDirectory}/Data/Files/{id}{.ext}` |
| Path persistence | Never persisted. `fileStorage` rebuilds the absolute path per call from the id plus the extension derived from `filename`, so iOS container relocation cannot invalidate it. |
| Extension source | `filenameExtension(filename)`; an extension failing `SafeExtSchema` is folded back into the stored name so the row and the on-disk suffix always agree. |
| Path safety | `managedFile` parses the id and extension before composing a path; nothing else may compose one. |

## Schema

`file_entry`: `id`, `filename` (including extension), `mediaType`, `size`, `createdAt`,
`updatedAt`, `deletedAt`, `provenance`, `libraryFileId`, `trashedWith`.

- `mediaType` is the IANA media type captured at import — picker metadata first, Expo's
  extension-derived `File.type` second, `application/octet-stream` last. Import fills an absent or
  generic document type from the PDF, Office, ODF, RTF, or EPUB filename before persisting it. The stored type is
  authoritative for every consumer; readers do not re-infer it from the extension. It is also the filter key for the
  library's category tabs (`image/%`, `application/pdf`, …), which is why extensions are not stored
  separately.
- `updatedAt` equals `createdAt` on insert. Its one writer today is the draft rewrite
  (`rewriteInternalTextEntry`), which records the new `size` and advances it monotonically. Logical
  rename and move update `library_file`, leaving version filenames and blob suffixes untouched.
- `provenance` is stable source identity: `imported` for a file brought in from a picker, camera,
  paste, or painting input; `generated` for ordinary files written or produced for the user by
  Cherry; `document-export` for new files produced by document export; `unknown` when the origin
  cannot be proven. Reattaching or sharing an existing file does not change its origin. It is
  written exactly once, by whoever creates the bytes, and never derived from an owner at read
  time — owners are deleted, and the library still has to answer.

  `unknown` is a real state, not a gap waiting to be filled. Rows that predate the column, and rows
  that will arrive from a peer with no provenance concept of its own, have no proven origin;
  recording them as `imported` would state something the data does not support. The library's
  Sharing tab selects `document-export`; exported images/documents remain in their media-type tabs.
  This value extends the existing text column without a database migration or changes to old rows.
- `deletedAt` is the time a user moved the file to trash. Library listing, attachment admission,
  Agent reads/edits, and previews exclude marked rows. Restore clears it. Trash and restore preserve
  `updatedAt`, which identifies the existing content/preview revision.

## Folders, Stable Paths, And History

`file_folder` stores parent, display name, normalized name key, timestamps, and trash membership.
`library_file` stores a stable logical file id, folder id, display name, and `currentEntryId`.
Every `file_entry.libraryFileId` joins one immutable version to that file. The current pointer and
new version are committed in one serialized write transaction; messages and paintings continue
referencing exact version ids. The library shows only current versions; older versions are kept
for those references and are not listed to users. The current version is deleted by trashing the
whole logical file.

Folders and files share a namespace within each folder, compared after NFC normalization and
Unicode lowercasing. Rename rejects conflicts; imports, moves, and restoration choose a readable
` (2)` suffix when needed. Existing root duplicates remain separate logical files. The root cannot
be selected as a workspace. Migration adds rows and references without moving or renaming blobs.

An Agent Session may bind one folder by `workspaceFolderId`. Renaming or moving that folder keeps
the binding; multiple Sessions may share it. A trashed folder retains the binding but is unavailable;
restoring it resumes access. Permanent deletion clears the binding through `ON DELETE SET NULL`.
No Session creates or owns a folder automatically. New attachments are imported directly into its
workspace; choosing an existing outside library version copies it there and preserves the source.
Without a workspace, outputs and new imports land in the library root.

The conversation header's folder action opens a workspace sheet showing the folder tree. Folder names
select the workspace; separate arrows expand a folder in place to show its subfolders, then its files.
File rows open the shared file viewer without attaching
files or changing the workspace. The sheet stays mounted while the viewer is open, preserving its
expansion and scroll state on return. The no-workspace option is a peer row. Association is optional and
can be changed or removed at any time; it never moves existing files. An unsent draft holds its
selection in memory under an opaque route token, without creating a Session. Its first submission
validates and persists that folder with the Session and first message pair in one transaction.
Each turn captures its workspace before execution, so switching during a running turn affects
subsequent turns. Association belongs to the conversation, and does not change other conversations
or the Agent's defaults.

Folder deletion marks its active subtree and all versions of those files with one `trashedWith`
root. Restore and purge operate on that group. Separately trashed subtrees stay independent; when
their old parent is unavailable, restoration falls back to the library root and resolves name
collisions. Backups include these rows and validate ancestry, cycles, names, current pointers,
version membership, and trash grouping. Restore clears orphan Session bindings; it rejects corrupt
folder or version references.

## Ownership

An owner stores the entry ids it points at, inside its own row:

| Owner | Where the ids live |
| --- | --- |
| Painting | `painting.files` — `{ input: string[], output: string[] }` |
| Agent message | `agent_session_message.data.parts[].fileEntryId` |

`write_file` and `edit_file` tool results each carry the `fileEntryId` they created in result JSON.
The Runtime projects the same id as a `purpose: 'artifact'` file part directly after its tool part;
chat keeps images in the body in transcript order and collects non-image files after the answer.
Images remain visible outside the collapsed process and appear before any following explanation.
As with every owner here, the reference outlives the bytes and degrades to the unavailable placeholder.

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

### Shared send-time preparation

`FileModule.prepareAttachments` and the Agent's session-scoped adapter share
`services/file/prepareFileAttachments`. It owns metadata admission, content budgets, and
`FileAttachmentReport`; importing a file does not parse it, and failed submission does not delete
the imported entry. Painting still admits images only.

`readAttachmentContent` is the common controlled reader for attachments and file tools. Its
document parser setting is supplied by the caller, with AnyDoc as the default. PDF always uses
the native text extractor with on-device OCR for pages without usable text and image pages whose text is sparse. The built-in parser supports DOCX/PPTX/XLSX text; AnyDoc 0.4.1 also
accepts DOC/PPT/XLS, ODT/ODS/ODP, RTF, and EPUB. `text/rtf` is a document, not raw UTF-8 text;
CSV stays on the text path. Format admission follows the published mobile entry point's
[content detection](https://github.com/tulaafrica/anydoc/blob/rn-v0.4.1/src/formats/detect.rs),
not every extension supported elsewhere in the engine.

The AnyDoc adapter dynamically loads the community module and retains its original `ir`,
`warnings`, asset references, media types, and byte buffers. JSON validation does not project a
fixed IR schema. A community `fallback` result is a parse failure, preserved as the backend error's
cause; it never triggers a second parser. Native module failure is separately classified as
`parser-unavailable`. No parsed document or derived asset gets a database table or library entry.

Prepared content is text or a document with complete/deferred delivery. Complete documents retain
the original JSON object. Oversized documents carry continuation metadata instead of a JSON prefix.
Embedded images fill a bounded budget (a 4,096-token context reserve each and 20 MiB) after the
directly attached images, including repeated historical occurrences, have been charged. Unsupported
image formats are not converted. Asset delivery descriptors state whether pixels were sent,
unsupported by the model/type, or omitted for budget. Reports persist only delivery facts and
omission reasons, never IR or image bytes.

AnyDoc uses published native libraries with Nitro/Nitrogen 0.36.4. A new development client is
required; installing JavaScript dependencies alone does not register the native module. The
package's permitted postinstall downloads the iOS XCFramework; Android obtains its library during
the native build. Native conversion has no hard cancellation; aborted reads discard late results.

### Agent projection

A persisted Agent file part stores `fileEntryId` plus Host-validated display metadata such as name
and media type — never an absolute sandbox path, which iOS invalidates on container relocation. The
Host verifies the live entry and managed blob before reserving a current submission. If the entry or
its bytes later disappear, the part remains in history and renders unavailable. For images, the Host
accepts only the shared AI image whitelist, validates the selected model and Pi endpoint before
reservation, and converts managed bytes to a bounded temporary Data URL for the active request. For
text, the Host accepts an explicit text/source allowlist, validates bounded managed bytes as strict
UTF-8, and projects a bounded structured Runtime part that Pi JSON-escapes as untrusted user
content. A leading UTF-8 BOM is accepted and stripped; NUL, binary controls, invalid UTF-8, and
unsupported binary media types fail closed before reservation. Text sources have a 5 MiB ceiling;
PDFs have a 50 MiB source ceiling and other documents retain a 20 MiB ceiling. PDFs use the existing
Expo native extractor (at most 100 pages and one million UTF-16 units). Android serializes PDF extraction and page-count reads,
with PDFBox stream buffers limited to 16 MiB in memory and 128 MiB across memory and temporary
storage in the app cache. Closing the document releases its scratch file. These are stream-buffer
limits, not a bound on all native allocations.

The [native PDF module](../../../modules/pdf-text-extractor/README.md) reads each page's text layer
first. Pages lacking usable text, or drawing images with fewer than 200 letters or digits of native
text, are rendered for Apple Vision (iOS) or bundled ML Kit Chinese/Latin recognition (Android).
Recognition follows the resolved app language and is skipped when the engine cannot read its
script. OCR runs locally, sequentially, with at most a 2560-pixel edge and four million rendered
pixels per page. Text and recognized pages are joined in order with blank-line separators. Blank
pages are accepted. Successful OCR with no usable text retains the other text and records one-based
`unrecognizedPages`, included in the attachment report, tool metadata and a leading model-facing
text notice. When the engine cannot read the app language's script, image pages are reported the
same way without recognition, and a document left with no text fails as `document-ocr-unsupported`.
Rendering/recognition-engine failures still reject partial text as `document-ocr-failed`; corrupt
native extraction fails as `document-invalid`. Android collects native page text and image facts in one PDFBox traversal.

The PDF reader coalesces concurrent reads and persists successful results in the disposable
`Paths.cache/PdfText` directory (64 MiB total, 8 MiB per entry). Keys contain the managed filename,
size, modification time, extraction-policy version, page ceiling and app language, never absolute
sandbox paths.
Later turns and tools reuse these results after normal file authorization/availability checks.
Hard deletion removes the entry's derived text; restore clears the cache. Eviction, cache purging
and policy changes may require extraction again. No derived text enters the library or database.
Each consumer's cancellation is independent; the last consumer cancels native work. Android
finishes the current ML Kit call before releasing its bitmap and the extraction slot.
`FileModule.observePdfOcr` aggregates extraction states by file entry, preferring active recognition
over queued reads. Each extraction clears only its own state. Queued files, including text PDFs,
show a neutral processing wait until extraction starts. Actual OCR draws the transcript tile's
progress stroke and page count, names the pending reply's wait, and adds the page count to a running
`read_file` row. Cache hits report nothing. The originating send/tool operation owns cancellation.
The original PDF is never modified and derived page images
are not stored. A new native development client is required.

In built-in mode,
DOCX/PPTX/XLSX use bounded in-memory ZIP/XML parsing and SheetJS
for workbook cells. Office ZIPs admit at most 2,048 entries, 32 MiB expanded data, and 4 MiB per XML
part; workbook extraction caps each sheet at 10,000 rows, processes at most 100 sheets, and Office
text is capped at one million UTF-16 units. Parser truncation is retained in the Runtime part.
XLSX extraction checks local entry metadata against the ZIP directory and bounds actual XML output
while decompressing. SheetJS receives a new uncompressed archive containing only the validated XML
and relationship parts, so original headers and embedded binary entries cannot bypass those limits.
All prepared document content shares the text attachment budget (200,000 code points per file, 400,000
per request, including repeated historical references). Word includes paragraphs and ancillary text,
PowerPoint follows slide relationships and includes speaker notes while excluding notes-page layout
fields such as slide numbers, dates, headers, and footers. These fields do not make an otherwise
textless document readable. Excel includes sheet names,
cell addresses, formatted values, and stored formulas without evaluating them. Embedded images,
charts as images, OCR inside Office documents, and legacy DOC/PPT/XLS inputs are not supported by
the built-in Office path.
DOCX/PPTX XML decoding remains UTF-8 only.
Empty documents fail with `ATTACHMENT_NO_TEXT`; damaged, encrypted, or over-limit documents fail
before reservation. Unreadable historical documents are omitted without failing a new turn.
Extracted content is encoded as untrusted user content. PDF text additionally has the bounded,
disposable disk cache described above; other document bodies remain request-local.

In AnyDoc mode, the Agent projects the unchanged IR as a `RuntimeDocumentAttachmentPart`.
Pi nests the original object in one JSON envelope with parser/version, trust, delivery facts, and
asset descriptors. Admitted image bytes use the existing image channel, with each image labelled
by `fileEntryId` and its original `assetRef`. No Markdown conversion or built-in enrichment is
applied; upstream differences such as workbook values without original cell coordinates remain.
Oversized IR is deferred to `read_file` rather than cut into invalid JSON. The Host captures
`file.document_parser.mode` before preparation's first await and shares that value with attachment
preparation and `read_file`. A later turn reparses historical input references with its own snapshot;
existing messages, attachment reports, and tool results are not rewritten.

Settings exposes **Document parser** as a local preference with AnyDoc selected by default and
Built-in available for comparison. Its picker describes both formats and the next-turn/PDF rules;
a failed preference save reports through the existing toast gateway. Under a sent message's attachments,
the transcript lists what the model did not receive from the reports: unrecognized PDF pages and
source or request truncation, naming the file when there are several. Reports still persist the actual parser, complete versus
deferred IR delivery, and image omission reasons; older messages without those facts remain
unspecified rather than inferred from today's preference.

Image attachments are sent to providers as inlined base64 data URLs; documents send text or raw
JSON and also work with text-only models, with embedded pixels explicitly marked unsent. The provider upload cache is deferred
until the AI SDK's Files Upload API leaves pre-release; its content hash belongs to that cache table,
not to `file_entry`.

## Lifecycle

**Create** — write bytes to `Data/Files`, then insert the row. A failed insert unlinks the bytes it
just wrote. A crash between the two leaves an orphan blob, reclaimable by the future cache-cleanup
sweep.

Agent file tools carry their cancellation signal through storage. New entries check cancellation
after writing bytes and inside the insert transaction, including after a queued write starts and
after insertion; rejected creation rolls back the row and discards its unregistered bytes. Once
creation passes its final transaction check, cancellation may leave the committed entry in place.
Storage does not discard bytes for a successful commit.

**Rewrite** — `rewriteInternalTextEntry` overwrites a draft's bytes at the same path, then records
the new `size`. Bytes first: a crash in between leaves a row whose `size` lags the blob, which every
reader tolerates, whereas a row updated ahead of its bytes would describe content the blob never
held. Only the turn that produced the draft may call it, one edit at a time: `edit_file` serializes
calls naming the same file so a rewrite is never built on bytes another edit has already replaced.
Storage queues draft edits with deletion and restoration, checking availability and cancellation
inside the write transaction before the synchronous file write. Once bytes have changed, the size
update finishes in the same transaction even if the turn is cancelled.

**Delete** — `deleteInternalEntry` removes the row first, then unlinks bytes and preview
best-effort; a leftover blob is reclaimable by orphan-blob sweeping, while a dangling row would not
be. Cancelling an attachment does not call it. User deletion calls `moveToTrash`; permanent trash
removal and compensating cleanup use the hard-delete path.

**Missing bytes** — a current submission fails before admission; an already-persisted reference
survives, the UI renders the "unavailable" placeholder, and later model history omits its content
without failing the turn. Nothing silently removes a historical reference.

**File-list updates** — `fileStorage` and `FileLibraryService` publish committed resource paths and
changed entry IDs through the existing Data API change bus. Trash/restore/purge publishes one batch
per transaction, including every affected version. `DataApiProvider` merges bursts for 300 ms and
invalidates resource queries, matching URI/preview keys and `meta.fileEntryIds` projections in one
cache pass. There is no separate file workflow event stream. Ordinary metadata changes do not
invalidate Session queries; rebinding a workspace or purging a bound folder does. Background Agent
and painting writes still refresh cached lists without a mounted library/composer. Content revision
keys remain intact; notification supplies freshness without discarding unrelated caches.

## Out of scope, deliberately

The avatar is a settings value, not a document: it lives at
`{documentDirectory}/user-avatar/{uuid}.webp` with the preference holding
`avatar-file:{uuid}.webp`, outside `file_entry` so it never appears in the file library. Provider
logos are similarly external (`{documentDirectory}/provider-avatars/`, resolved by directory listing)
— a known exemption, not a model to copy.

## Extension points

**File library.** `library_file` owns the logical name, folder placement and current-version pointer;
`file_folder` owns the hierarchy, and `file_entry` owns each content version. The library query joins
the logical file to its active current version; history reads the versions of that logical file.
The Sharing tab selects `provenance: 'document-export'` without reclassifying historical rows. See
[Document Export](../document-export.md).
General imported/generated provenance filters remain unshipped. Deletion sets `deletedAt` and keeps
bytes and previews. The [file trash](./trash.md) restores entries, permanently deletes them, and
clears the whole trash. Files older than 30 days in trash are permanently deleted at app startup
and foreground entry, without a timer or background task. No reverse-reference warning is needed:
existing messages and paintings show their unavailable placeholder until a file is restored.
Backups include trashed rows and bytes with the original deletion time; the next sweep removes
expired restored trash. Orphan-blob sweeping remains separate from trash retention.

**Agent file writes and generated artifacts.** `write_file` stores bounded UTF-8 text and accepts
relative workspace paths. Existing paths require `base_file_entry_id` and `base_revision` from a
read; a changed current pointer, draft revision, or destination fails with a conflict. `edit_file`
uses exact UTF-8 replacement and the same commit checks. Same-turn drafts rewrite in place after
checking the current pointer and revision inside the write transaction. Later turns create a new
version under the same logical name. A failed save removes its uncommitted blob.

`read_file` and `edit_file` accept conversation references and workspace files. Outside-library
search and reads use `library_search_files` and `library_read_file`, which are `auto` like other
reads. A successful read permits editing that source during the turn, but never grants unrestricted
reads. Editing an outside source creates a workspace copy.
`generate_image`, direct image generation, Code Mode tool calls and saved script outputs, and stored
MCP results use the captured workspace destination. Tool outputs contain managed ids and revisions,
never device paths. A workspace turn names its folder in `list_workspace`, and the system prompt
states that relative paths and saved files belong to it and that the model lists or searches it
before relying on its contents; the folder's file list is never injected into the prompt.

`read_file` returns bounded line windows for UTF-8/built-in/PDF output, or raw JSON character
windows for AnyDoc. JSON offsets count Unicode code points; concatenating windows recovers the
original serialized IR. Asset descriptors contain references and sizes, never pixels. For text,
`sourceTruncated` distinguishes the extractor cap from a pageable window's `truncated` flag.

**Readable names.** Every file Cherry produces is named for what it is, never for its id: an
imported file keeps the name it arrived with (a camera photo, which has none, falls back to
`Image`), versions keep the logical name, `write_file` uses the name the model chose, and a generated
image is named after its prompt through `readableFilename` (`sunset over the bay.png`, with a
numeric suffix for siblings from one request). The `painting-{id}` fallback in `fileStorage` is a
last resort for a caller that supplies no name, not a naming scheme.

Office generation and editing tools publish bytes through `fileContent.createBytesEntry` and the
`'bytes'` source of `createInternalEntry`, with generated provenance and the usual artifact envelope.
They read managed sources and images through `WorkspaceFileAccess.resolveRead`, requiring a
conversation grant or live membership in the selected workspace. Outputs are separate logical files
in that workspace, or at the library root without a workspace. Storage validates the workspace
placement at commit; Office edits do not advance the source logical file's version.
[Office inspection and editing tools](../agent/office-tools-design.md) bind edits to a source SHA-256,
preserve imported sources and publish new derived entries. Preview selections carry structural
anchors and excerpts for the Agent; references alone never grant access. The file library is also the
Version 1 artifact library; no parallel artifact blob store or external authoritative path exists.
Raw picker, provider, and device URIs are transient import
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
