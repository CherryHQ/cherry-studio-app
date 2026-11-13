# Conversation consumption

This app-shell owner defines what the chat workspace, sidebar, Agent picker and transcript export
read from either conversation source, and it retains the catalog sources those consumers share.
It does not own local execution or observation.

Remote Session `readingAidScope` is a stable desktop-binding and Session namespace for phone-owned
translations. Message revisions travel with display/export values. The common translation store
runs both sources; local saves patch the owning Agent message, remote saves use the bounded mobile
cache. Neither citation arrival nor opening a tool changes the original prose hash. Cached remote
reading aids cannot cross a binding, Session, message revision, content hash or language.

## Shared contract

`contracts.ts` is a read model plus interaction callbacks with no lifecycle:

- `ConversationSnapshot`, `ConversationMessage`, `ConversationInteraction` and
  `ConversationExecution`: what the workspace renders, with optional bound actions (respond,
  cancel, retry, fork, remove). Unsupported actions are absent; temporary unavailability is
  explicit. Interaction and tool inputs are `ResourceRead` values: inline for in-process data,
  deferred under a stable key for desktop-owned bytes.
- `ConversationHistoryView`: the paginated window shape the workspace and share selector consume.
  Each source owns the hook that produces it.
- `ConversationCatalog`, `ConversationPreview` and the summaries: sidebar and Agent picker rows,
  optional selected-session metadata, lightweight status subscriptions and bound rename/delete.
- `TranscriptMessage`/`TranscriptSnapshot`: pure export values. A desktop selection resolves
  citations and freezes image bytes as `prepared-file` parts before it returns; no deferred reader,
  authenticated URL or fabricated local file ID enters document conversion. The desktop revision
  is rechecked after resource preparation.
- `ConversationSource`: a catalog owner with availability state. It never opens a transcript.

`ConversationProvider` constructs the local catalog and the retained desktop sources
(`createConversationSources`). `ConversationSourceBoundary` and the catalog hooks retain a source
for one consumer; concurrent consumers share one active desktop source and the last release
disposes connection demand while metadata stays cached in Query for five minutes.

## Local

`local/createLocalConversationSource` is catalog only: Agent and Session lists, selected-session
metadata, and row previews that map Host status and frontend read marks. It refreshes from the Data
API change feed. Local chat observation, admission, history and message actions belong to the chat
page (`features/chat/runtime`), which projects its own client state into the shared read model.
Local execution settles in-process, so the shared contract never needs pending or interrupted
outcomes, revisioned history windows or deferred content from this source.

The local Session catalog lists root conversations first. Its optional `listSessionChildren`
capability reads a single parent's direct children in stable creation order, only while that node
is expanded. Summaries retain `forkedFromSessionId`, `createdAt` and `hasChildren`; relationship
geometry and disclosure state belong to the sidebar. `readSessionPath` returns root-first metadata
through the selected Session in one read, so a deep selection can be located without serial parent
requests. Child cursors are scoped to their parent, and both child and path queries refresh with
Session metadata changes. Sources without those capabilities retain their existing list behavior.

Collapsed family previews and Agent previews share a status-only subscription. Only Sessions with
a status in the current Host generation need a metadata path read; groups never expand their
child pages or open transcripts to compute a hint. The last group reader cancels unfinished path
reads and releases status/read-mark subscriptions. Metadata changes invalidate paths, and read
marks clear completed hints. Required approval, required reply, progress, failure and unread
completion are prioritized in that order when several Sessions have different states.

## Remote

`remote/` is the desktop-owned contract and its consumers. `remoteContracts.ts` adds what the
authoritative-elsewhere case requires: `RemoteConversationSource` with `openSession` and a
task-scoped read-only opener, drafts with
idempotent starts and the operation journal; `RemoteConversationSession` with observation
activation, `HistoryWindow` revisions and cursors, and `prepareSelection`; `pending`/`interrupted`
outcomes; `RemoteConversationSnapshot` with `historyVersion`, send admission and terminal execution
results. `useConversation`, `useConversationHistory`, `useConversationDraft` and
`useRemoteConversationSource` are exported from `remote/index.ts` for the remote chat page and the
desktop share route and scheduled-task module.

Known desktop supplemental parts are validated with the existing Agent content schemas before
entering the common renderer. Native URL sources, search suggestions and compaction anchors keep
their source part identity. Inline and revision-bound payloads use the same backend read cache;
unknown or invalid data does not become an executable local capability.

`readToolCitations` reads only recognized, completed lookup results through their existing
`ResourceRead` values. Chat prepares these source facts independently of history loading and
passes them in `MessageListItem.data.citationSources`; public citation parsing and source cards
consume the facts without treating a tool name as permission to execute a local capability.

Task metadata is a separate `RemoteTaskCatalogQueries` contract in `remote/remoteTaskContracts.ts`,
exposed as `RemoteConversationSource.tasks`. It is not part of `RemoteConversationCatalog`.
Task hooks consume only these reads and own their visible-list polling policy. Both catalogs share
the retained source, binding-scoped metadata cache, cursor validation and read cancellation.
The task-session opener composes backend task membership validation with the existing read-only
conversation Session; it does not implement task queries itself.

Retired catalogs, windows and deferred reads are cancelled and evicted from Query. Cursor and
resource refs are bound to the source scope; a replacement pairing cannot reuse them. The desktop
adapter does not invent missing catalog capabilities, and message actions the protocol lacks are
simply absent.

See [Service Dependencies And Ownership](../../../../docs/references/remote-access/service-ownership.md)
for backend lifetimes and remaining migration work.
