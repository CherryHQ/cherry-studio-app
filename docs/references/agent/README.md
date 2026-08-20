# Agent Architecture

Status: **design**. Version 1 is local-only.

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
- **Pi** and **AI SDK** are Host-private Runtime implementations. The Agent Client sees only the
  Agent Protocol and protocol-level capabilities; Runtime identity never crosses that boundary.

The Agent Client must not import the Agent Runtime contract. Only the Mobile Agent Host depends on
both contracts and maps between them.

Runtime independence is a dependency rule, not a packaging decision. The contract may begin in the
app and move to a package when a real independent consumer exists.

## Version 1

- All execution is local to the Mobile process.
- The application selects the `local` execution target, never a Runtime id.
- The Router selects Pi when the resolved Agent configuration contains Agent tools; otherwise it
  selects the AI SDK Runtime.
- A Session has at most one active turn.
- Mobile persistence is the complete conversation record.
- The Host supplies complete normalized context for every turn; a Runtime may keep private
  in-memory state, but it is not authoritative.
- Route remounts and foreground transitions recover from a Host snapshot.
- A process death cannot resume a local turn. Startup reconciliation marks unfinished work as
  interrupted.

LAN/cloud execution targets, their Runtime adapters, and remote-authoritative Sessions are a future
direction. They enter through the same Router, but their transport, security, storage, and recovery
rules require a separate design. Version 1 defines none of those details.

## Open Questions

- **Agent tool** is the sole routing criterion, but it does not yet have a precise definition:
  which tool kinds qualify (built-in, MCP, or both) and how they relate to the Runtime contract's
  `RuntimeTool` are TODO, pending confirmation before implementation.

## Documents

| Document | Scope |
| --- | --- |
| [Agent Protocol](./agent-protocol.md) | Mobile application entities, operations, events, snapshots, errors, and invariants |
| [Agent Runtime](./agent-runtime.md) | Independent local execution contract, Host boundary, lifecycle, and implementation conformance |

## Current Implementation

This design does not yet replace the current Topic, Chat Runtime, or desktop-aligned `agent_*`
surfaces. Current-state references remain authoritative until implementation lands.

## Related

- [Architecture Overview](../architecture-overview.md) — dependency direction and layer boundaries
- [Runtime Ownership](../runtime-ownership.md) — app-owned runtime lifetime and background limits
- [Chat Streaming And Rendering](../chat/streaming-and-rendering.md) — current Chat Runtime behavior
- [`@cherrystudio/ai-runtime`](../../../packages/ai-runtime/README.md) — existing AI SDK execution
  primitives available to the AI SDK Runtime implementation
