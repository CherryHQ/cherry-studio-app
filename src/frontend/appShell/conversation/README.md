# Conversation consumption

Execution failures retain the shared failure snapshot through remote projection, message history,
and transcript export. Terminal results carry a message fallback and committed-history readiness;
the presenter keeps partial live content until matching history takes over, including same-batch
message removal and failed history reads. Persistence failures display separately and never claim
the response was saved. Unsupported desktop failure contracts disable Agent access only.

This frontend owner serves local/remote chat, sidebar catalogs and transcript export. Source kind dispatch lives
in `createConversationSources`; backend execution remains in the existing local `AgentProtocol`
and the narrow `remoteAgent` workflow module.

See [Service Dependencies And Ownership](../../../../docs/references/remote-access/service-ownership.md)
for current consumers, backend lifetimes, and migration gaps.

Sources own opaque references and stable query scopes. Session handles own observation; disposing
one never cancels an admitted local or desktop execution. Actions bind their target and validate it
again at admission. Unsupported actions are absent; temporary unavailability is explicit. Reads
accept cancellation, while command IDs and pending outcomes survive route disposal.

History windows own their fixed version and cursor namespace. `ConversationPresenter` retains a
live row until a successful history installation can replace or remove it. Resource metadata does
not imply downloadable bytes. Selection preparation returns complete export values without giving
the document engine an Agent or desktop dependency.

Migration state: local chat now consumes Conversation history, snapshots, approvals, bound message
actions and the common presenter. Local composer/model/attachment navigation remains on the existing
client extension. Chat sharing uses the same session reader for both sources, keeps the prepared
snapshot until export closes, and no longer calls the old Controller or reads local Data API directly.
The previous local history hook and remote share loader have been removed. Resource queries cancel
on release and clear sensitive values on retirement; revised local approvals get new resource refs.

Local and remote sidebars, and remote chat, retain sources through ConversationSourceBoundary. Common catalog hooks
share Agent/session metadata queries while each view owns its visible pagination. The last reader
cancels unfinished reads; source retirement clears its binding's cached metadata. The
remote route borrows its retained source for the Session observation. A failed offline open keeps
source demand and retries after backend reconnection; route exit still cancels late reads.

Sources expose start operations even without reopening the originating Draft. Draft persistence
uses draftScope, a stable identity/grant binding, while Query scopes remain generation-specific.
Remote composer start/send/cancel and recovery views use bound actions; navigation never resends an
uncertain command. Session metadata supplies Agent/workspace identity. Resource sheets receive their
Session explicitly and read only while mounted. Approval cancellation targets its bound execution.

The Controller contract/provider and private remote queries are removed. Local composer extensions,
prepared managed export assets and actual device acceptance remain pending. Remote question
resources and typed responses preserve complete answers through the command journal. Catalogs
expose a system-workspace choice only when the desktop advertises support; existing sessions
retain the real workspace identity and kind. Local approvals keep their decision-only capability.

Sidebar presentation is shared across sources. Catalogs expose Agent identity on session summaries,
an optional selected-session metadata read, and optional metadata invalidation. Row previews supply
lightweight status subscriptions and bound rename/delete actions without opening transcript handles.
The local adapter maps Host status and frontend read marks; the remote adapter does not invent
missing catalog capabilities. Selected metadata has the same cancellation and retirement rules as
list queries. Device selection and connection framing remain outside the shared catalog presentation.

Catalog metadata stays in React Query memory for five minutes after its last reader leaves.
Remounts show existing data immediately and refresh in the background. Remote catalog identity and
Agent/session-list cursor refs bind to the desktop identity and grant, not IP or transport generation.
Concurrent consumers share one active source; the last release disposes connection demand even
while metadata remains cached. Pairing directory changes clear idle desktop catalogs; active
sources clear their binding on retirement. Workspace choices, resources, commands and live status
remain runtime-owned and never borrow metadata cache authority. No disk catalog is introduced.
Desktop emoji travels as optional catalog metadata, including multi-code-point sequences; image
avatars remain on their existing local image path and cache policy.

Admission rejections retain the desktop reason and diagnostic message through the durable command
journal, first-send workflow, action result and operation snapshot. The UI translates the closed
failure code; diagnostic text is available only through an explicit details action. Expected
rejections restore the composer draft without replacing the explanation with a generic error.
