# System Entry

The app shell owns one foreground consumer for native shares. It starts only after the bootstrap
and router gates are ready. `SystemEntryBridge` wraps the root navigator and retains one unsent
share in React context while `/share-destination` chooses its destination. Later shares stay in
`useSystemEntryClaims` or native staging.

A share is composer content, not a submission. The destination page consumes
`useSystemShareDestination` and the sidebar's `ConversationDestinationList`. Choosing an Agent
opens its draft; choosing a conversation adds a composer handoff to that Session. Nothing is sent
until the user sends it. The destination list owns Agent loading, empty and error states; opening
the page does not wait for an Agent query. Route parameters carry a memory-only handoff token,
never shared text, file paths or callback functions.

`useSystemEntryClaims` owns the claim loop. A resolved claim has already completed its native entry,
so the hook delivers it through the latest render rather than the effect that started it, holds it
while the shell cannot open it, and runs a claim requested meanwhile once the current one settles.
The bridge's synchronous phase guard admits one choice and keeps the next share queued until the
current destination route has left.

The route push keeps the previous chat mounted. A handoff back into that Session appends without
losing its live draft. Drafts in conversations that are not mounted are not persisted by this flow.
Choosing a destination dismisses to chat, which replaces the current page when chat is not in the
stack. Close, system back and an interactive pop end this share when the destination route exits,
leaving the previous route and composer unchanged. A cancelled share does not reopen on foreground.
All content remains transient, as with composer handoffs; this is not durable per-conversation
draft storage.

`useSystemEntryReceiving` reports a claimed share that is still importing, so app-shell surfaces can
treat that launch as a share before its destination page opens.
