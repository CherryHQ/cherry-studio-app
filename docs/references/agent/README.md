# Agent Architecture

Status: **Agent, tool binding, MCP Runtime adaptation, and Agent Session persistence/backend
integration implemented**. Version 1 is local-only and still tool-less at the Host boundary.

Cherry Mobile owns Agents and Sessions. Pi is the sole local conversation and Agent engine. The
Host-private Agent Runtime contract keeps Pi isolated from application protocol and persistence;
it is not a strategy interface for choosing between Pi and the AI SDK. AI SDK may remain behind
non-conversation model-capability services, including image generation invoked by a Runtime tool,
but it does not own Agent transcripts, tool loops, or local Runtime selection.

## Boundaries

```text
Agent Client
    ↕ Agent Protocol
Mobile Agent Host
    ↕ Agent Runtime contract
Pi Runtime
    ↕ immutable RuntimeTool snapshot
Application capability adapters
```

- The **Agent Protocol** is the application contract between the frontend Agent Client and the
  backend Mobile Agent Host. It defines Sessions, the local execution target, turns, messages,
  commands, snapshots, and events.
- The **Mobile Agent Host** owns Agent lookup, Session persistence, message history,
  execution admission, streaming overlay, and lifecycle recovery.
- An **Agent Runtime** receives prepared execution input and emits normalized execution events. It
  does not know Cherry Agent rows, Session rows, SQLite, React, Expo, or application protocol types.
- **Pi** is the only Host-private local Runtime implementation. The Agent Client sees only the Agent
  Protocol and protocol-level capabilities; Pi and provider-SDK identities never cross that
  boundary.
- **Application capability adapters** own HTTP MCP, device APIs, model-capability SDKs, Office
  generation, and managed files. Pi sees only the Runtime tool contract and stable artifact refs.

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
  normal conversation; a non-empty snapshot enables Pi's tool loop. Tool bindings are now
  persisted, but the current Host does not project them and still supplies an empty snapshot.
- The Host also initializes a controlled resource ledger from managed files already visible to the
  turn. Application capabilities may add validated managed outputs during execution; arbitrary tool
  JSON and paths cannot expand it.
- Before each turn, the Host resolves only the mobile-supported Skills enabled in the current Agent
  configuration. Skills provide instruction context; they are not tools and cannot expand the tool
  snapshot or resource ledger. Their loading and persistence details are deferred.

Branching is also a future direction with its model already decided: Sessions never branch in
place via a message tree; a branch is a fork into a new Session that copies the transcript up to a
clean cut. See [Branching](./agent-protocol.md#branching) for the rules.

## Settled Tool And Skill Direction

- Built-in tools and Streamable HTTP MCP use one application-owned binding model with per-tool
  approval policy and stable built-in/MCP `ToolRef` identities. Provider-safe aliases and display
  names are not persistence authority. The database and Data API persist those bindings, and the
  HTTP MCP adapter can project selected raw descriptors into executable Runtime tools; Host
  resolution and injection remain separate work. The logical model and resolution rules are in
  [Agent Tools And Controlled Resources](./agent-tools-and-resources.md).
- AI SDK and `@cherrystudio/ai-core` may implement non-conversation model capabilities behind
  application-owned tools. They never become a parallel Agent or Chat Runtime.
- Calendar, Office generation/inspection/patching, image generation, and file operations are
  capability adapters. Office tools use versioned Cherry-owned specs and edit operations rather
  than exposing renderer APIs or OOXML. File access is limited to managed `file_entry` ids visible
  to the turn, edits are copy-on-write, and generated artifact parts are not implicit model
  attachments.
- Skills are mobile-owned, controlled instruction resources selected by Agent configuration. Mobile
  does not assume that desktop directory-based Skills are executable or compatible, and Skills have
  no callbacks, scripts, network access, or permission authority; see
  [Agent Skills](./agent-skills.md).

## Open Questions

- **Provider coverage** for the Pi model layer currently starts with API-key-authenticated OpenAI
  Responses endpoints. Expanding it is separate provider work and is not a reason to retain a
  second conversation runtime.
- **Background turn continuation** is undecided on both iOS and Android. Candidate platform
  mechanisms must be evaluated against the actual workload, OS support, user-visible behavior, and
  store policy before one becomes architecture. Today both platforms may suspend or terminate local
  work, so interrupted-turn reconciliation remains the contract floor. Any continuation design also
  needs a protocol for re-attaching an observed Session to a still-running turn.
- **Context compaction** is undesigned. The ownership split is decided: the durable conversation
  record belongs to the Host (it must survive process death and back transcript reads), while
  turning that structured record into the actual model prompt — selection, formatting, and
  eventually compaction — is Pi-owned engine strategy. Compaction needs a contract collaboration
  point because its artifacts must persist and a Runtime cannot write application storage (for
  example, a context-artifact event the Host stores and replays into later turns). Design it
  together with the Pi Runtime.

## Documents

| Document | Scope |
| --- | --- |
| [Agent Protocol](./agent-protocol.md) | Mobile application entities, operations, events, snapshots, errors, and invariants |
| [Agent Runtime](./agent-runtime.md) | Independent local execution contract, Host boundary, lifecycle, and implementation conformance |
| [Agent Persistence](./agent-persistence.md) | Durable SQLite schema behind `AgentSessionStore`, the Turn projection, delete semantics, and the rollout plan |
| [Agent Tools And Controlled Resources](./agent-tools-and-resources.md) | Tool bindings, capability adapters, approvals, HTTP MCP, managed files, and artifacts |
| [Agent Skills](./agent-skills.md) | Mobile Skill ownership, compatibility boundary, trust, and deferred design |

## Current Implementation

The Runtime contract, Fake Runtime, Pi Runtime, Protocol contract, and Mobile Agent Host are
implemented. The Host binds `local` directly to Pi, consumes the message-centric
`AgentSessionStore` port, owns the Turn projection, and merges immutable composer model/reasoning
snapshots over the current Agent definition for each execution. These snapshots are not persisted
by the Agent Protocol. The durable `SqliteAgentSessionStore` is the production store binding over the
`agent`/`agent_session`/`agent_session_message` tables. Agent CRUD and static Session/transcript
reads are exposed through the Data API, and the Host resolves definitions from the `agent` table.
The table intentionally starts empty: retired Assistant data is not migrated or copied. See
[Agent Persistence](./agent-persistence.md) for the schema, delete semantics, and remaining
follow-ups, per the authority direction of
[#568](https://github.com/CherryHQ/cherry-studio-app/issues/568).

The production Pi model adapter currently accepts API-key-authenticated OpenAI Responses endpoints.
Pi maps text, reasoning, cumulative usage, cancellation, native tool loops, and approval decisions
onto the Runtime contract. Agent tool bindings are durable and exposed through the typed Data API.
The HTTP MCP adapter preserves raw JSON Schemas and creates bounded, cancellable Runtime callbacks,
but the Host does not resolve bindings into that adapter yet and deliberately supplies `tools: []`;
file attachments are rejected before provider execution until the Host-side file resolver lands.

The primary chat frontend consumes the Agent Data API and observes `Backend.agent`; Agent Sessions
own its route identity, transcript, streaming, and cancellation. The retired Assistant/Topic/Message
tables, management screens, and Chat Runtime have been removed.

Application-owned tool Runtime integration — binding resolution, the per-turn `RuntimeTool`
snapshot, and Host injection — remains follow-up work, along with Mobile Skill
configuration/loading and broader Pi provider coverage. Managed attachments and artifacts, the
avatar workflow, and context compaction are also separate follow-ups.

## Related

- [Architecture Overview](../architecture-overview.md) — dependency direction and layer boundaries
- [Runtime Ownership](../runtime-ownership.md) — app-owned runtime lifetime and background limits
- [Chat Streaming And Rendering](../chat/streaming-and-rendering.md) — Agent Session observation and rendering
- [`@cherrystudio/ai-runtime`](../../../packages/ai-runtime/README.md) — portable desktop-aligned AI
  helpers; it is not the local Agent Runtime
