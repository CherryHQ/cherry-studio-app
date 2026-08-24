# Agent Architecture

Status: **Phase 1–3 architecture slice implemented**. Version 1 is local-only.

Cherry Mobile owns Agents and Sessions. An independent Agent Runtime executes one prepared turn.
The first Runtime implementations may use Pi or the AI SDK; both implement the same contract and
remain invisible to the application protocol.

## Boundaries

```text
Agent Client
    ↕ Agent Protocol
Mobile Agent Host
    ↓ Agent Runtime Router
    ↕ Agent Runtime contract
Pi Runtime | AI SDK Runtime
```

- The **Agent Protocol** is the application contract between the frontend Agent Client and the
  backend Mobile Agent Host. It defines Sessions, execution targets, turns, messages, commands,
  snapshots, and events.
- The **Mobile Agent Host** owns Agent lookup, Session persistence, message history, runtime
  routing, tool policy, streaming overlay, and lifecycle recovery.
- The **Agent Runtime Router** is the only place that selects an implementation. It receives the
  execution target and resolved Agent configuration, then resolves a registered Runtime.
- An **Agent Runtime** receives prepared execution input and emits normalized execution events. It
  does not know Cherry Agent rows, Session rows, SQLite, React, Expo, or application protocol types.
- **Pi** and **AI SDK** are Host-private local Runtime implementations. The Agent Client sees only
  the Agent Protocol and protocol-level capabilities; Runtime identity never crosses that boundary.

The Agent Client must not import the Agent Runtime contract. Only the Mobile Agent Host depends on
both contracts and maps between them.

Runtime independence is a dependency rule, not a packaging decision. The contract may begin in the
app and move to a package when a real independent consumer exists.

## Version 1

- All execution is local to the Mobile process.
- The application selects the `local` execution target, never a Runtime id.
- Version 1 registers only the AI SDK Runtime, so every supported `local` route resolves to it.
- A Session has at most one active turn.
- A Session is pinned at creation to one Runtime for its whole lifetime; it never re-routes. A
  different Runtime requires a new Session (or a fork).
- Mobile persistence is the complete conversation record.
- The Host supplies complete normalized context for every turn; a Runtime may keep private
  in-memory state, but it is not authoritative.
- Route remounts and foreground transitions recover from a Host snapshot.
- A process death cannot resume a local turn. Startup reconciliation marks unfinished work as
  interrupted.

LAN/cloud execution targets, their Runtime adapters, and remote-authoritative Sessions are a future
direction. They enter through the same Router, but their transport, security, storage, and recovery
rules require a separate design. Version 1 defines none of those details.

Branching is also a future direction with its model already decided: Sessions never branch in
place via a message tree; a branch is a fork into a new Session that copies the transcript up to a
clean cut. See [Branching](./agent-protocol.md#branching) for the rules.

## Open Questions

- **Runtime routing policy** is undecided. Its configuration and inputs may belong to an Agent, a
  Session, an execution target, connection state, or broader application policy. Version 1 does
  not reserve fields for any of those possibilities; it only implements `local → ai-sdk`. Once a
  Runtime is resolved for a Session, that binding remains fixed for the Session lifetime.
- **Agent tools** are also undefined: which tool kinds qualify (built-in, MCP, or both), how they
  relate to the Runtime contract's `RuntimeTool`, and how Pi consumes them are deferred until the
  Pi Runtime is designed. They are not assumed to be a routing criterion.
- **Context compaction** is undesigned. The ownership split is decided: the durable conversation
  record belongs to the Host (it must survive process death and back transcript reads), while
  turning that record into the actual model prompt — selection, formatting, and eventually
  compaction — is Runtime-owned engine strategy. Compaction needs a contract collaboration point
  because its artifacts must persist and a Runtime cannot write application storage (for example,
  a context-artifact event the Host stores and replays into later turns). Design it together with
  the Pi Runtime.

## Documents

| Document | Scope |
| --- | --- |
| [Agent Protocol](./agent-protocol.md) | Mobile application entities, operations, events, snapshots, errors, and invariants |
| [Agent Runtime](./agent-runtime.md) | Independent local execution contract, Host boundary, lifecycle, and implementation conformance |
| [Agent Persistence](./agent-persistence.md) | Durable SQLite schema behind `AgentSessionStore`, the Turn projection, delete semantics, and the rollout plan |

## Current Implementation

The Runtime contract, Fake Runtime, AI SDK Runtime, Protocol contract, Mobile Agent Host, and V1
Router are implemented as an architecture slice. The Host consumes the message-centric
`AgentSessionStore` port and owns the Turn projection. The durable `SqliteAgentSessionStore`,
`agent`/`agent_session`/`agent_session_message` tables, and agent-table definition source are
implemented as inactive foundation code, with agent rows seeded once from existing assistants.
Production composition deliberately continues to use the process-local store and assistant-backed
definition source until the Agent/Pi business integration. See
[Agent Persistence](./agent-persistence.md) for the schema, delete semantics, and remaining
follow-ups, per the authority direction of
[#568](https://github.com/CherryHQ/cherry-studio-app/issues/568).

No frontend currently consumes `Backend.agent`. This slice does not replace the current Topic,
Chat Runtime, or desktop-aligned `agent_*` surfaces. Pi, attachments, production activation of
durable Agent persistence, and UI integration remain follow-up work.

## Related

- [Architecture Overview](../architecture-overview.md) — dependency direction and layer boundaries
- [Runtime Ownership](../runtime-ownership.md) — app-owned runtime lifetime and background limits
- [Chat Streaming And Rendering](../chat/streaming-and-rendering.md) — current Chat Runtime behavior
- [`@cherrystudio/ai-runtime`](../../../packages/ai-runtime/README.md) — existing AI SDK execution
  primitives available to the AI SDK Runtime implementation
