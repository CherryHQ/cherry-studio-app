# PC Agent Controller Migration

The prototype Controller boundary is removed from the current #997 working tree. Remote chat and
sidebar now consume `appShell/conversation`, whose remote adapter calls `Backend.remoteAgent`.
The old provider, private queries/resource loaders, Controller contract and `agent-version` gate
were removed together after switching consumers and running focused regression checks.

```text
RemoteChatScreen / SidebarConversationList
  → ConversationSource / Catalog / Session / Draft
  → Backend.remoteAgent
  → RemoteAgentRuntime + DesktopConnectionManager
  → shared Noise / JSON-RPC desktop protocol
```

[Remote Access](../remote-access/README.md) owns the wire contract, and
[Service Dependencies And Ownership](../remote-access/service-ownership.md) owns the current call
graph, lifetimes and remaining migration work. Local execution stays on `Backend.agent`.

The product keeps PC Agent selection, paginated sessions/history, registered and advertised system
workspace selection, send/cancel, approval/denial, question forms, and shared transcript/export
presentation. Agent edits, local model IDs, arbitrary PC paths and registered-workspace management
do not cross this boundary. Desktop owns creation of a session's system workspace.

The matching desktop protocol now accepts question answers and denial reasons, and advertises
system-workspace creation. Mobile preserves complete answers through the common interaction
contract and command journal. The current sheet has no denial-reason editor. Older desktops still
support plain decisions and registered workspaces. Files expose metadata only; artifact downloads
remain a separate protocol task.

Pending commands and their exact parameters belong to the backend journal. Source-level start
operations remain discoverable after route exit, including original input and a partially created
session. Reconnection recovers receipts; frontend navigation never resubmits an uncertain command.

This implementation is not device acceptance. Managed export assets, pairing channel adoption,
local composer admission and actual iOS/Android desktop conversation verification remain pending.
