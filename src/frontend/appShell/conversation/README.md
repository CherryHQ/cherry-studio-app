# Conversation consumption

This app-shell owner defines what the chat workspace, sidebar, Agent picker and transcript export
read from either conversation source, and it retains the catalog sources those consumers share.
It does not own local execution or observation.

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
- `TranscriptMessage`/`TranscriptSnapshot`: pure export values.
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

## Remote

`remote/` is the desktop-owned contract and its consumers. `remoteContracts.ts` adds what the
authoritative-elsewhere case requires: `RemoteConversationSource` with `openSession`, drafts with
idempotent starts and the operation journal; `RemoteConversationSession` with observation
activation, `HistoryWindow` revisions and cursors, and `prepareSelection`; `pending`/`interrupted`
outcomes; `RemoteConversationSnapshot` with `historyVersion`, send admission and terminal execution
results. `useConversation`, `useConversationHistory`, `useConversationDraft` and
`useRemoteConversationSource` are exported from `remote/index.ts` for the remote chat page and the
desktop share route only.

Retired catalogs, windows and deferred reads are cancelled and evicted from Query. Cursor and
resource refs are bound to the source scope; a replacement pairing cannot reuse them. The desktop
adapter does not invent missing catalog capabilities, and message actions the protocol lacks are
simply absent.

See [Service Dependencies And Ownership](../../../../docs/references/remote-access/service-ownership.md)
for backend lifetimes and remaining migration work.
