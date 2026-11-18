# DeepSeek conversation import

`Backend.deepseekImport.importFromUrl` accepts a signed DeepSeek export download link. The settings
page owns the input and localized progress. `DeepseekImportRuntime` owns download, archive staging,
managed images and database publication. Composition joins its cancellation before SQLite closes
and counts the whole operation, including cleanup, in backup admission. Leaving the page cancels
the operation. Downloads have no background execution lease or process-death resume.

## Source and validation

Validation is deliberately lenient once the ZIP directory can be read. An independently damaged
entry can be skipped, and readable conversations are still imported.

The shared URL parser admits any HTTPS link whose host contains `deepseek`, so export storage can
move between buckets, regions or providers without an app update. Credentials in the authority are
rejected. The `chat.deepseek.com/share/` route has a dedicated prompt to paste the official data
export download link. An `Expires` query value in the past is reported before downloading.
The original signed URL is passed unchanged to the native downloader. The application does not log
or persist it. The archive is untrusted whatever its source and is validated after download.

The shared native downloader enforces transfer size, timeout and cancellation. DeepSeek provides
no trusted SHA-256 with its link, so this private download explicitly selects caller validation,
never reuses a cached file and is not treated as a verified model or application asset. The shared
ZIP reader requires a structurally readable central directory and validates the bounds, sizes and
CRC of each entry. Unreadable, unsupported or duplicate entries are skipped. Files are staged
under app-generated names and indexed by archive name. This lets case-distinct paths and files
with a shared path prefix coexist on the device. The archive is bounded at 1 GiB
compressed/expanded, 65,535 entries and 32 MiB per JSON file.

The manifest and conversation index are optional. `chat_sessions/<id>.json` entries listed in the
ZIP directory identify conversation candidates. The index contributes timestamps. A
candidate is skipped and counted if its entry cannot be extracted, its JSON cannot be read, or it
has no usable message list. Within a readable conversation, malformed messages, unknown or
malformed fragments and malformed attachment records are dropped. Roles are case-insensitive and a
missing status reads as finished. Timestamps accept ISO text or epoch seconds/milliseconds. An
unreadable time falls back to the index, then the surrounding messages, then the import time.

The transcript requires alternating questions and answers, so the tree is repaired rather than
checked: a missing or later parent makes a message a root, a same-role parent is replaced by the
nearest opposite-role ancestor, and a duplicate ID keeps its first message. An answer with no
question above it has nowhere to attach and is dropped; its children attach to the nearest kept
ancestor. A selected message that does not survive falls back to the last message.
An actually empty message list can retain its session metadata alongside populated sessions. A
nonempty conversation that has no surviving message is skipped. At least one message must be
saved for the import to succeed, and the result counts saved messages and sessions.

The format follows the official
[DeepSeek importer](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/deepseek-chat-import/src/format.ts)
and [history format](https://github.com/deepseek-ai/chat-demo/blob/main/src/services/chat/history/README.md).
The user's real export was inspected for schema compatibility without copying private content into
source or fixtures. Native import acceptance and regression execution require user authorization.

## Persistence

Each successful invocation creates a **new** agent named `DeepSeek`, reusing normal Agent creation
defaults, including the saved default model when available. It does not choose or configure a new
provider. Every conversation is assigned to that new agent; importing again creates another agent.
Existing agents and conversations are retained.

Each new agent stores `builtin:deepseek` in `avatar`, which `AgentAvatar` resolves to the bundled
image.

All conversation/message IDs are remapped, all branches and the selected message are retained,
and the original titles and historical timestamps are preserved. Import is the explicit
historical timestamp exception; subsequent local mutations retain the ordinary timestamp rules.
Search text is produced by the existing transcript index owner. Usage, inference snapshots,
checkpoints and provider replay signatures are not fabricated.

Images actually present in the export use `importManagedFile`, including normal import-time image
normalization. Image identity comes from `is_image` and the referenced archive entry, not a filename
extension. Any extracted entry may be referenced. Unsafe attachment names are sanitized, and an
image that cannot be imported is reported like a missing original. A bounded file-header read identifies the media type; the extension is only a fallback,
and unknown headers retain their image identity. Message parts use the managed entry's final name
and media type, including any import-time normalization. Missing or non-image attachment originals
retain their names as source text and produce an import warning; no fake file handles are created.
Search and read-link metadata become
validated HTTP(S) source parts, not executable historical tool calls. Unknown metadata fragments
are ignored. Finished answers and stopped `INCOMPLETE` text are readable; failed/template replies
retain their exported diagnostics in error parts, which do not enter model context. Stored reasoning
remains readable and follows the existing policy that omits unsigned thinking during replay.

Images are prepared before the conversation transaction. Failure and cancellation discard them.
After success, the importer discards any prepared images without a saved message reference.
Agent creation and every conversation/message write share one transaction, so a failed commit
cannot leave an empty imported agent or a partial set of conversations. A large export may hold
the write queue for a long time; other writes wait rather than fail. Both loops check cancellation
at every conversation, image and 40-row batch, and yield to the app there once 50 ms of work has
accumulated, so the screen stays responsive and leaving the page rolls the transaction back
promptly. Parsing one conversation is not split; the 32 MiB JSON bound limits that pause. Image cleanup
is best effort, matching the shared file owner. Cache cleanup cannot change a committed outcome.
Conversation JSON is read one file at a time, avoiding a second full archive in JS memory.

On success, failure or cancellation, the operation's finalizer attempts to remove its downloaded
ZIP and extracted directory. The downloader also removes partial transfers and releases its native
task/listener. Images referenced by committed conversations remain managed attachments. Cleanup
failures are logged; this module has no startup sweep for remnants left by process termination.

The diagnostic log records an import failure's phase, code, archive error classification and HTTP
status when available. Partial imports record counts of imported and skipped conversations and
missing attachments. Archive entry skips also have a count. These records use the existing
feedback bundle log path and omit links, filenames, titles, contents and underlying error text.

The settings tutorial is three localized operation diagrams: open settings, request export, copy
the complete download link. It is not a screenshot of a user's account. All 13 locales are included.
