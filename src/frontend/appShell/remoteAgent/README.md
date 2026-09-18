# Remote Agent Connection

This app-shell boundary owns retained PC controller leases, connection state, recovery-action
subscriptions, and paginated Agent/session reads consumed independently by the drawer and chat.
Import its `index.ts` public surface; page-specific interaction sheets remain in `features/chat/remote`.

Queries include the device and pairing generation. The flat conversation feed enumerates PC Agents
because `sessions.list` requires an Agent ID. It merges pages by session ID; Agent groups load their
own history lazily. A source change drops the old UI identity, never cancelling PC execution.

`RemoteAgentProvider` keeps its context boundary mounted while acquiring a controller. Consumers
can reuse the same frame in their fallback and connected content without remounting header menus;
only connected children may read the controller context.
