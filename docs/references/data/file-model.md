# File Model

> Status: as-built.

How Cherry Mobile stores user- and generation-owned files. This model is mobile-native and
deliberately diverges from Cherry Desktop's `FileEntry`: desktop's external-path entries, content
hashing, cleanup policies, and entry-level trash have no mobile consumer, so none of them exist
here. Terms follow [Domain Language](../domain-language.md).

## Invariants

1. **Files are first-class.** A file is a peer of the Agent message or painting that uses it, not a
   dependent of it. Every entry belongs in the file library.
2. **Content is immutable once its turn ends.** An entry produced by an Agent turn is that turn's
   draft and may be rewritten in place by the same turn's `edit_file`; the moment the turn ends,
   or for any entry the turn did not produce, bytes never change and an "edit" creates a new
   version entry. Nothing else in the app rewrites a managed blob.
3. **Cherry owns every blob.** Picker, camera, and provider URIs are transient import sources whose
   bytes are copied into `Data/Files`. No entry references a path outside the sandbox.
4. **Import happens when the file enters the app.** Painting imports at generation time; the Agent
   Composer imports when an attachment enters its managed draft.
5. **Business-object deletion never deletes files.** Deleting an Agent Session or painting leaves
   every file it pointed at in place.
6. **Only the user deletes files.** Removing a composer attachment removes its reference, not the
   library entry. Deletion belongs to the file library; there is no background garbage collection.
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
  extension-derived `File.type` second, `application/octet-stream` last. Import fills an absent or
  generic document type from the PDF, Office, ODF, RTF, or EPUB filename before persisting it. The stored type is
  authoritative for every consumer; readers do not re-infer it from the extension. It is also the filter key for the
  library's category tabs (`image/%`, `application/pdf`, …), which is why extensions are not stored
  separately.
- `updatedAt` equals `createdAt` on insert. Its one writer today is the draft rewrite
  (`rewriteInternalTextEntry`), which records the new `size` and bumps it; a future metadata update
  (library rename) will be the second.
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

### Shared send-time preparation

`FileModule.prepareAttachments` and the Agent's session-scoped adapter share
`services/file/prepareFileAttachments`. It owns metadata admission, content budgets, and
`FileAttachmentReport`; importing a file does not parse it, and failed submission does not delete
the imported entry. Painting still admits images only.

`readAttachmentContent` is the common controlled reader for attachments and file tools. Its
document parser setting is supplied by the caller, with AnyDoc as the default. PDF always uses
the native text extractor. The built-in parser supports DOCX/PPTX/XLSX text; AnyDoc 0.4.1 also
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
the original JSON object. Oversized documents carry continuation metadata instead of a JSON
prefix. Embedded images share count, byte, and context reserves with directly attached images,
including repeated historical occurrences. Unsupported image formats are not converted. Asset
delivery descriptors state whether pixels were sent, unsupported by the model/type, or omitted
for budget. Reports persist only delivery facts and omission reasons, never IR or image bytes.

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
unsupported binary media types fail closed before reservation. Documents have a 20 MiB source
limit. PDFs use the existing Expo native extractor (at most 100 pages). In built-in mode,
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
charts as images, scanned-document OCR, and legacy DOC/PPT/XLS inputs are not supported by this path.
DOCX/PPTX XML decoding remains UTF-8 only.
Empty documents fail with `ATTACHMENT_NO_TEXT`; damaged, encrypted, or over-limit documents fail
before reservation. Unreadable historical documents are omitted without failing a new turn.
Extracted text remains request-local, is encoded as untrusted user content, and is never persisted.

In AnyDoc mode, the Agent projects the unchanged IR as a `RuntimeDocumentAttachmentPart`.
Pi nests the original object in one JSON envelope with parser/version, trust, delivery facts, and
asset descriptors. Admitted image bytes use the existing image channel, with each image labelled
by `fileEntryId` and its original `assetRef`. No Markdown conversion or built-in enrichment is
applied; upstream differences such as workbook values without original cell coordinates remain.
Oversized IR is deferred to `read_file` rather than cut into invalid JSON. The Host captures
`file.document_parser.mode` before preparation's first await and shares that value with attachment
preparation and `read_file`. A later turn reparses historical input references with its own snapshot;
existing messages, attachment reports, and tool results are not rewritten.

Image attachments are sent to providers as inlined base64 data URLs; documents send text or raw
JSON and also work with text-only models, with embedded pixels explicitly marked unsent. The provider upload cache is deferred
until the AI SDK's Files Upload API leaves pre-release; its content hash belongs to that cache table,
not to `file_entry`.

## Lifecycle

**Create** — write bytes to `Data/Files`, then insert the row. A failed insert unlinks the bytes it
just wrote. A crash between the two leaves an orphan blob, reclaimable by the future cache-cleanup
sweep.

**Rewrite** — `rewriteInternalTextEntry` overwrites a draft's bytes at the same path, then records
the new `size`. Bytes first: a crash in between leaves a row whose `size` lags the blob, which every
reader tolerates, whereas a row updated ahead of its bytes would describe content the blob never
held. Only the turn that produced the draft may call it, one edit at a time: `edit_file` serializes
calls naming the same file so a rewrite is never built on bytes another edit has already replaced.

**Delete** — `deleteInternalEntry` removes the row inside a write transaction, then unlinks the
bytes best-effort. Row first: a leftover blob is reclaimable, a dangling row is not. Cancelling an
attachment does not call it; deletion and the future trash belong to the library.

**Missing bytes** — a current submission fails before admission; an already-persisted reference
survives, the UI renders the "unavailable" placeholder, and later model history omits its content
without failing the turn. Nothing silently removes a historical reference.

**File-list updates** — all managed-file writes go through `fileStorage`. Its create, rewrite,
delete, and compensating-discard operations announce changes after entry persistence commits;
failed writes do not announce a successful change. `FileModule.subscribeChanges` exposes this
notification to the app-wide frontend `FileQueryBridge`, which invalidates every shared file-list
page size. This also covers background painting and Agent writes while the library and composer
are unmounted. Business callers do not refresh queries; URI and preview caches remain reusable
under their existing file/version keys.

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
selected by active `fileEntryId` and applies exact replacement. If the source is a draft of the
current turn it rewrites that entry's bytes through `rewriteInternalTextEntry` (bytes first, then
the row's `size`), so a turn ends with one artifact per file; otherwise it creates a
same-media-type entry named for its version (`report.html` → `report v2.html`) through the same
text boundary, and the source is history. New entries persist with `provenance: 'generated'` and return in the Runtime artifact
envelope; `generate_image` likewise imports generated image bytes with generated provenance.
`write_file` reads no entry and does not consult the turn resource ledger. Knowledge of a valid id
is sufficient for `edit_file` even outside that ledger, but it exposes no file listing or search.
`read_file` returns bounded line windows for UTF-8/built-in/PDF output, or explicit raw JSON
character windows for AnyDoc, and creates nothing. JSON offsets count Unicode code points;
concatenating all windows recovers `JSON.stringify(original IR)`, including long strings. Asset
descriptors contain references and sizes, never pixels. For text output, `sourceTruncated`
distinguishes an extraction cap from the pageable line window's `truncated` flag. Versions are
carried in the filename rather than a lineage column; folding a version chain in the library is a
future library concern and needs no schema change to start.

**Readable names.** Every file Cherry produces is named for what it is, never for its id: an
imported file keeps the name it arrived with (a camera photo, which has none, falls back to
`Image`), a version carries its number, `write_file` uses the name the model chose, and a generated
image is named after its prompt through `readableFilename` (`sunset over the bay.png`, with a
numeric suffix for siblings from one request). The `painting-{id}` fallback in `fileStorage` is a
last resort for a caller that supplies no name, not a naming scheme.

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
