# Agent Architecture

Status: **Phase 1–3 foundation implemented; Pi-first integration in progress**. Version 1 is
local-only.

Cherry Mobile owns Agents and Sessions. Pi is the sole local conversation and Agent engine. The
Host-private Agent Runtime contract keeps Pi isolated from application protocol and persistence;
it is not a strategy interface for choosing between Pi and the AI SDK. AI SDK may remain behind
non-Agent provider or generation services, but it does not own Agent transcripts, tool loops, or
local Runtime selection.

## Boundaries

```text
Agent Client
    ↕ Agent Protocol
Mobile Agent Host
    ↕ Agent Runtime contract
Pi Runtime
```

- The **Agent Protocol** is the application contract between the frontend Agent Client and the
  backend Mobile Agent Host. It defines Sessions, the local execution target, turns, messages,
  commands, snapshots, and events.
- The **Mobile Agent Host** owns Agent lookup, Session persistence, message history,
  execution admission, tool resolution and policy, streaming overlay, and lifecycle recovery.
- An **Agent Runtime** receives prepared execution input and emits normalized execution events. It
  does not know Cherry Agent rows, Session rows, SQLite, React, Expo, or application protocol types.
- **Pi** is the only Host-private local Runtime implementation. The Agent Client sees only the Agent
  Protocol and protocol-level capabilities; Pi and provider-SDK identities never cross that
  boundary.

The Agent Client must not import the Agent Runtime contract. Only the Mobile Agent Host depends on
both contracts and maps between them.

Runtime independence is a dependency rule, not a packaging decision. The contract may begin in the
app and move to a package when a real independent consumer exists.

## Version 1

- All execution is local to the Mobile process.
- The application selects the `local` execution target, never a Runtime id.
- Application composition injects one Pi Runtime into the Host. There is no local Runtime registry
  or implementation router.
- A Session has at most one active turn.
- A Session records the `local` execution target. Version 1 has no local engine choice to persist or
  re-route.
- Mobile persistence is the complete conversation record.
- The Host supplies complete normalized context for every turn; a Runtime may keep private
  in-memory state, but it is not authoritative.
- Route remounts and foreground transitions recover from a Host snapshot.
- A process death cannot resume a local turn. Startup reconciliation marks unfinished work as
  interrupted.
- Before each turn, the Host resolves an immutable tool snapshot from the current Agent
  configuration, platform availability, permissions, and approval policy. An empty snapshot is
  normal conversation; a non-empty snapshot enables Pi's tool loop.

Branching is also a future direction with its model already decided: Sessions never branch in
place via a message tree; a branch is a fork into a new Session that copies the transcript up to a
clean cut. See [Branching](./agent-protocol.md#branching) for the rules.

## Open Questions

- **Tool configuration storage** is not yet settled. Built-in, MCP, and future tool references need
  one application-owned configuration model with per-tool approval policy. Pi must receive only the
  resolved per-turn snapshot and must not read that storage directly.
- **Provider coverage** for the Pi model layer must be completed before the transitional AI SDK chat
  path can be removed. Provider coverage is an adapter concern, not a reason to retain a second
  Agent Runtime.
- **Context compaction** is undesigned. The ownership split is decided: the durable conversation
  record belongs to the Host (it must survive process death and back transcript reads), while
  turning that structured record into the actual model prompt — selection, formatting, and
  eventually compaction — is Pi-owned engine strategy. Compaction needs a contract collaboration
  point
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
Router exist as an earlier architecture slice. The Host consumes the message-centric
`AgentSessionStore` port and owns the Turn projection. The durable `SqliteAgentSessionStore` is
the production store binding over the `agent`/`agent_session`/`agent_session_message` tables.
Agent CRUD and static Session/transcript reads are exposed through the Data API, and the Host
resolves definitions from the `agent` table. The table intentionally starts empty: no assistant
data is migrated or copied. See
[Agent Persistence](./agent-persistence.md) for the schema, delete semantics, and remaining
follow-ups, per the authority direction of
[#568](https://github.com/CherryHQ/cherry-studio-app/issues/568).

No frontend currently consumes the Agent Data API or `Backend.agent`. These additive data slices do
not replace the current Topic or Chat Runtime surfaces. The current Topic Chat path has a
transitional Pi adapter selected by `EXPO_PUBLIC_CHAT_RUNTIME`; development defaults to Pi and other
builds default to AI SDK. That adapter currently handles text/reasoning only and rejects
tool-bearing requests. It is not the final Pi Agent Runtime described here.

The next integration replaces the Host's AI SDK Runtime registration and Router with a directly
composed Pi Runtime, resolves neutral `RuntimeTool` snapshots for each turn, maps Pi tool events into
the Agent Protocol, and uses the active durable store as the Session authority. Attachments and
the avatar workflow, and Agent UI remain separate follow-up work. The transitional AI SDK Chat path
is removed only after required provider coverage is available through Pi.

## Related

- [Architecture Overview](../architecture-overview.md) — dependency direction and layer boundaries
- [Runtime Ownership](../runtime-ownership.md) — app-owned runtime lifetime and background limits
- [Chat Streaming And Rendering](../chat/streaming-and-rendering.md) — current Chat Runtime behavior
- [`@cherrystudio/ai-runtime`](../../../packages/ai-runtime/README.md) — portable desktop-aligned AI
  helpers; it is not the local Agent Runtime
