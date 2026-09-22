# PC Agent Controller Migration

The prototype Controller boundary is removed from the current #997 working tree. Remote chat and
sidebar now consume `appShell/conversation`, whose remote adapter calls `Backend.remoteAgent`.
The old provider, private queries/resource loaders, Controller contract and `agent-version` gate
were removed together after switching consumers and running focused regression checks.

```text
RemoteChatScreen / SidebarRemoteRecents
  → ConversationSource / Catalog / Session / Draft
  → Backend.remoteAgent
  → RemoteAgentRuntime + DesktopConnectionManager
  → shared Noise / JSON-RPC desktop protocol
```

[Remote Access](../remote-access/README.md) owns the wire contract, and
[Service Dependencies And Ownership](../remote-access/service-ownership.md) owns the current call
graph, lifetimes and remaining migration work. Local execution stays on `Backend.agent`.

The product keeps existing PC Agent selection, paginated sessions/history, registered workspace
selection, send/cancel, approval/denial, and shared transcript/export presentation. Agent edits,
local model IDs, arbitrary PC paths and workspace creation do not cross this boundary.

Current protocol limits differ from the old prototype: responses accept approve/deny only, creation
requires an explicit registered workspace ID, and files expose metadata only. Question answers,
free-form denial reasons, default-workspace creation and artifact downloads cannot be restored by
frontend adaptation alone. The UI does not send unsupported values or silently drop question answers.

Pending commands and their exact parameters belong to the backend journal. Source-level start
operations remain discoverable after route exit, including original input and a partially created
session. Reconnection recovers receipts; frontend navigation never resubmits an uncertain command.

This implementation is not device acceptance. Managed export assets, pairing channel adoption,
local composer admission and actual iOS/Android desktop conversation verification remain pending.
