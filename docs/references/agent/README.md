# Agent Architecture

Status: **design**. This subtree specifies the Cherry Mobile Agent Protocol and its boundary with an
independent Agent Runtime for Cherry Mobile v2. It describes the target architecture, not current
implementation behavior; each document is promoted to current-state reference as its phase lands.

Mobile v2 is a clean build. There is no persisted format to preserve, no shipped agent runtime to
retrofit, and no client contract to keep compatible. The design takes that freedom and spends it on
the two decisions that are expensive to change later: **which semantics belong to the application
protocol** and **which execution behavior belongs to the reusable runtime**.

## Thesis

> Every Cherry conversation is an agent session. A plain assistant chat is bound to an in-app
> Runtime; a coding session may be bound to a LAN or cloud Runtime. They share one application
> protocol and renderer, but not one persistence policy: a local session keeps its complete record
> locally, while a remote session keeps only a compact local projection and reads execution detail
> from its authoritative Runtime endpoint on demand.

Five rules follow, and everything else in these documents is a consequence of them:

1. **Cherry Mobile owns the application protocol.** Commands, events, snapshots, session views, and
   message parts describe Cherry Mobile product behavior. They live under
   `src/shared/agent/protocol`, not in a workspace package and not in `packages/universal`.
2. **The application protocol spans frontend and backend.** Every command, event, and snapshot is
   JSON and survives an application transport. It remains separate from any protocol used by a LAN
   or cloud Runtime.
3. **Every Agent Runtime implements one independent contract.** Local, LAN, and cloud deployments
   accept the same execution requests and produce the same normalized execution events. The
   contract does not know Cherry sessions, message branches, revisions, snapshots, persistence,
   React, or Expo.
4. **The application adapter is the boundary.** `src/backend/services/agent` translates protocol
   commands into runtime operations and runtime events into persisted Cherry state plus protocol
   events. Runtime-specific requests, events, authentication, and transports remain inside thin
   adapters.
5. **Authority is explicit per session.** A `local-canonical` session treats Mobile persistence as
   its complete record. A `remote-canonical` session treats the LAN or cloud execution store as the
   authority and never mirrors raw reasoning, MCP payloads, command logs, traces, or other detailed
   execution content into Mobile persistence. The local projection contains only what list,
   transcript, search, and offline shells need.

Runtime implementation and deployment location are separate dimensions. For example, a coding
Runtime may be hosted over LAN or in the cloud, while an AI SDK Runtime may run locally or behind a
service. Shared application code reads declared capabilities and the session's record mode; it
never infers behavior from a Runtime implementation id. Mobile v2 assigns `local-canonical` to
local endpoints and `remote-canonical` to LAN and cloud endpoints, but records that decision on the
session instead of scattering endpoint checks through the application.

## Documents

| Document | Scope |
| --- | --- |
| [Agent Protocol](./agent-protocol.md) | The Mobile-owned application contract: entities, message and part model, commands, events, snapshots, capabilities, errors, versioning, invariants |
| [Agent Runtime](./agent-runtime.md) | The independent execution contract, Local/LAN/Cloud adapters, and the Mobile-owned host, storage, recovery, and frontend integration around it |

Read the protocol first. The runtime document assumes its vocabulary.

## Related

- [Architecture Overview](../architecture-overview.md) — dependency direction and layer boundaries
- [Runtime Ownership](../runtime-ownership.md) — owner roles, bootstrap, backgrounding constraints
- [Code Organization](../code-organization.md) — module placement and public surfaces
- [Domain Language](../domain-language.md) — terminology; the v2 vocabulary in these documents
  supersedes the Topic, Chat Runtime, Chat Module, and Streaming Message Overlay entries once
  its implementation phases land; `AgentSessionView` remains distinct from the caller-owned
  lifecycle role described in [Agent Runtime §12](./agent-runtime.md#12-placement-and-integration)
- [`@cherrystudio/ai-runtime`](../../../packages/ai-runtime/README.md) — existing portable AI SDK,
  provider, message, and tool behavior used beneath the Agent Runtime adapter
- Desktop [issue #18802](https://github.com/CherryHQ/cherry-studio/issues/18802) — a related desktop
  proposal; it informs behavior but does not own the Mobile application protocol
