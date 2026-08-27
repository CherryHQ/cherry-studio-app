# Agent Architecture

> Status: as-built. Mobile Agent execution is device-local only.

This directory documents Cherry Mobile's conversation execution boundary. Cherry owns Agents,
Sessions, persistence, application capabilities, and the frontend protocol. Pi is the sole local
conversation engine.

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

- **Agent Protocol** is the frontend/backend application contract for Sessions, turns, messages,
  commands, snapshots, events, approvals, and errors.
- **Mobile Agent Host** owns Agent lookup, Session persistence, turn admission, attachment
  resolution, immutable tool snapshots, live projection, terminal persistence, and restart
  reconciliation.
- **Agent Runtime** receives prepared model, history, input, and tools, then emits normalized events.
  It does not know application rows, SQLite, Data API, React, Expo, or navigation.
- **Pi Runtime** is the only local Runtime implementation. Runtime independence is a dependency
  boundary, not an implementation-selection feature.
- **Capability adapters** own built-in device tools, HTTP MCP, web access, image generation, managed
  files, permissions, credentials, timeouts, and side-effect policy.

The Agent Client never imports the Runtime contract. The Host is the only adapter that depends on
both sides.

## Current Contract

- Execution target is always `local`; there is no local engine registry or persisted Runtime
  choice. Cloud and LAN desktop control are separate domains and do not execute Mobile Agents.
- One Session permits at most one active turn, while different Sessions may run concurrently.
- Mobile SQLite is the complete record for mobile-originated Sessions. The retired
  Assistant/Topic/Message tables and Chat Runtime are not compatibility paths.
- The Host combines the shared system capability catalog, turn-local composer selections, and the
  current Agent's persisted MCP bindings into a frozen tool snapshot before each turn. An empty
  snapshot is ordinary conversation.
- Pi owns the model → tool → result loop. Application adapters retain permission, credential,
  managed-file, and approval authority.
- Managed image and bounded text input are resolved by the Host before execution. Arbitrary paths
  and tool JSON cannot expand the turn's controlled resource ledger.
- Pi produces and consumes opaque, versioned context checkpoints; the Host validates, persists, and
  replays them without interpreting their payload.
- Route unmount removes frontend observation but does not cancel a Host-owned turn. Process death
  cannot resume a local turn; startup reconciliation marks unfinished work interrupted.

## Current Boundaries

- Mobile Skill persistence, Agent-to-Skill bindings, loading, and prompt projection are not
  implemented.
- Office generation, inspection, and patching tools are not implemented.
- Local turns have no durable resume after process death.
- Provider coverage and model capability remain explicit; unsupported combinations fail before
  execution rather than selecting a second conversation runtime.

## Documents

| Document | Source of truth for |
| --- | --- |
| [Agent Protocol](./agent-protocol.md) | Application values, operations, events, snapshots, errors, and invariants |
| [Agent Runtime](./agent-runtime.md) | Host-private execution input/output, Pi binding, lifetime, and conformance |
| [Agent Persistence](./agent-persistence.md) | SQLite schema, store adapter, deletion semantics, and current limitations |
| [Agent Tools And Controlled Resources](./agent-tools-and-resources.md) | System capabilities, MCP bindings, approvals, managed files, and artifacts |
| [Agent Skills](./agent-skills.md) | Explicitly deferred Mobile Skill policy and trust boundary |

## Related

- [Architecture Overview](../architecture-overview.md) — dependency direction and layer ownership
- [Runtime Ownership](../runtime-ownership.md) — Host lifetime, observation, and shutdown
- [Chat Streaming And Rendering](../chat/streaming-and-rendering.md) — transcript windows, live
  projection, and rendering
- [`@cherrystudio/ai-runtime`](../../../packages/ai-runtime/README.md) — portable provider and message
  helpers; it is not the local Agent Runtime
