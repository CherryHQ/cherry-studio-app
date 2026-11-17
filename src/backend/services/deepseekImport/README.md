# DeepSeek conversation import

`Backend.deepseekImport.importFromUrl` accepts a signed DeepSeek export download link. The settings
page owns the input and localized progress. `DeepseekImportRuntime` owns download, archive staging,
managed images and database publication. Composition joins its cancellation before SQLite closes
and counts the whole operation, including cleanup, in backup admission. Leaving the page cancels
the operation. Downloads have no background execution lease or process-death resume.

## Source and validation

The shared URL parser admits only HTTPS links to the verified
`deepseek-chat-history-exports-prod.obs.cn-east-3.myhuaweicloud.com` bucket, a UUID ZIP path, the
DeepSeek export filename and a non-expired signed query. Other object-storage buckets, credentials
in the authority, custom ports, fragments and duplicate signature parameters are rejected. The
original signed URL is passed unchanged to the native downloader. The application does not log or
persist it. Domain validation cannot verify the signature locally; the storage service does that
when serving the archive. Other export regions require independent confirmation before admission.

The shared native downloader enforces transfer size, timeout and cancellation. DeepSeek provides
no trusted SHA-256 with its link, so this private download explicitly selects caller validation,
never reuses a cached file and is not treated as a verified model or application asset. Before
import, the shared ZIP reader verifies central/local headers, sizes, CRC, paths and resource limits.
JSON validation then requires export format 3, an index that matches all conversation files,
valid timestamps and a complete alternating-role message tree. The archive is bounded at 1 GiB
compressed/expanded, 20,000 entries, 32 MiB per JSON file and 100,000 messages in total.

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

All conversation/message IDs are remapped, all branches and the selected message are retained,
and the original titles and validated historical timestamps are preserved. Import is the explicit
historical timestamp exception; subsequent local mutations retain the ordinary timestamp rules.
Search text is produced by the existing transcript index owner. Usage, inference snapshots,
checkpoints and provider replay signatures are not fabricated.

Images actually present in the export use `importManagedFile`, including normal import-time image
normalization. Missing or non-image attachment originals retain their names as source text and
produce an import warning; no fake file handles are created. Search and read-link metadata become
validated HTTP(S) source parts, not executable historical tool calls. Unknown metadata fragments
are ignored. Finished answers and stopped `INCOMPLETE` text are readable; failed/template replies
retain their exported diagnostics in error parts, which do not enter model context. Stored reasoning
remains readable and follows the existing policy that omits unsigned thinking during replay.

Images are prepared before the conversation transaction and removed on failure/cancellation.
Agent creation and every conversation/message write share one transaction, so a rejected file or
failed commit cannot leave an empty imported agent or a partial set of conversations. Image cleanup
is best effort, matching the shared file owner. Cache cleanup cannot change a committed outcome.
Conversation JSON is read one file at a time, avoiding a second full archive in JS memory.

On success, failure or cancellation, the operation's finalizer attempts to remove its downloaded
ZIP and extracted directory. The downloader also removes partial transfers and releases its native
task/listener. Images referenced by committed conversations remain managed attachments. Cleanup
failures are logged; this module has no startup sweep for remnants left by process termination.

The settings tutorial is three localized operation diagrams: open settings, request export, copy
the complete download link. It is not a screenshot of a user's account. All 13 locales are included.
