# Agent Architecture

> Status: the local experimental branch uses Pi Durable 1.1.0; authorized runtime and device
> acceptance is pending. The separate PC Agent Controller version 2 keeps its existing behavior.

This directory documents Cherry Mobile's conversation execution boundary. For mobile-originated
local execution, Cherry Mobile owns Agents, business Sessions, application capabilities, and the
frontend protocol. Pi is the sole local conversation engine and owns execution/history persistence.
[Pi Durable Migration](./pi-durable-migration.md) is the current experimental specification.

## Boundaries

```text
Agent Client
    ↕ Agent Protocol
Mobile Agent Host
    ↕ DurableAgentRuntime contract
Pi Harness → pi-agent.db
    ↕ current RuntimeTool callbacks
Application capability adapters
```

- **Agent Protocol** is the frontend/backend application contract for Sessions, turns, messages,
  commands, snapshots, events, approvals, and errors.
- **Mobile Agent Host** owns Agent lookup, business metadata repair, admission policy, attachment
  resolution, current tool authorization, and live projection. It does not persist another transcript
  or rebuild context for ordinary submissions.
- **Durable Agent Runtime** owns upstream admission, observation, history, configuration, forks,
  abort, reset, and recovery. Portable SQL capabilities are injected; it does not import application
  rows, Data API, React, Expo, or navigation. Pi types stay private to its implementation.
- **Pi Runtime** is the only local Runtime implementation. Runtime independence is a dependency
  boundary, not an implementation-selection feature.
- **Capability adapters** own built-in device tools, HTTP MCP, web access, image generation, managed
  files, permissions, credentials, timeouts, and side-effect policy.

The Agent Client never imports the Runtime contract. The Host is the only adapter that depends on
both sides.

## PC Agent Controller Boundary

The PC mobile experience controls a PC-hosted Agent; it does not move that Agent's conversation
Runtime onto mobile:

```text
Agent Client
    ↕ Agent Protocol values
Mobile PC Agent Adapter
    ↕ transport-specific connection
PC Agent Runtime / Host
    ├─ authoritative conversation and Session state
    ├─ execution, tools, approvals, and background tasks
    └─ persistence
```

The PC owns the Agent, Session, conversation, execution, tool, approval, task, and persistence state.
Mobile consumes normalized events, renders a temporary application projection, and sends user
intent such as messages, cancellation, and approval decisions. Independent background-task control awaits PC support. It does not run
the PC Agent or copy the PC Runtime into the Mobile Agent Host.

The adapter maps the PC's native snapshots, events, resources, and errors into the application-facing
Agent Protocol and maps mobile commands back to PC operations. It separately owns transport,
authentication, ordering, reconnection, and compatibility with PC wire versions. The current adapter
uses the encrypted Cherry Remote v1 WebSocket and re-queries snapshots/history; PC has no event replay.
The PC implementation is not required to implement the local TypeScript `AgentProtocol` interface
or expose the local `AgentRuntime` contract.

Version 1 remains local-only. The application-level extension is specified in
[Agent Protocol](./agent-protocol.md#pc-agent-controller-extension); the implemented subset, transport
ownership, and PC follow-ups are in [PC Agent Controller](./pc-agent-controller.md). See
[Backend AI Target Architecture](../ai/target-architecture.md#pc-agent-controller-boundary).

## Current Contract

- Execution target is always `local`; there is no local engine registry or persisted Runtime
  choice. The PC Agent Controller is not a second local Runtime or a current execution
  target.
- One Session permits at most one active turn and a native follow-up queue; different Sessions may
  run concurrently. Busy submissions must retain the active model/options/tools configuration.
- The paired Cherry and Pi SQLite databases are the complete local record. The retired
  Assistant/Topic/Message tables and Chat Runtime are not compatibility paths.
- The Host combines the shared system capability catalog, the Agent's capability-group deny-list,
  and the current Agent's persisted MCP bindings into a frozen tool snapshot before each turn. An
  empty snapshot is ordinary conversation.
- The Host builds the mobile-owned application prompt for every turn. Fixed Runtime rules define
  truthful capability use, approval and permission behavior, untrusted-content handling, mobile
  lifecycle, and result reporting. The Host also injects the App's effective language and requires
  responses in that language unless the user explicitly requests another one; the user-configured
  Agent instructions remain a separate role and style section. Capability guidance is included only
  when its supporting tool is in the frozen snapshot. Runtime adapters do not append separate
  application policy, but may add guidance for binding-specific mechanics such as Pi's deferred MCP
  catalog. Bundled plugin guides follow the same turn boundary: only sections supported by the
  Agent's executable plugin tools enter the prompt, with plugin/revision attribution and no history
  mutation. Guide workflows remain subordinate to the user's request and Agent instructions.
- Pi owns the model → tool → result loop. Application adapters retain permission, credential,
  managed-file, and approval authority.
- Managed image and bounded text input are resolved by the Host before execution. Arbitrary paths
  and tool JSON cannot expand the turn's controlled resource ledger.
- Pi manages context, compaction, and durable task recovery. Cherry checkpoint/replay readers are
  used only for one-time legacy handoff.
- Route unmount removes frontend observation. Ordinary close and OS expiry preserve native work;
  startup/foreground reconstruct current dependencies before resume. Explicit stop is terminal.
  Unsafe interrupted tools retain an interruption outcome instead of repeating their effects.

## Current Boundaries

- Mobile Skill persistence, Agent-to-Skill bindings, loading, and prompt projection are not
  implemented.
- Office generation, inspection, and patching tools are not implemented.
- Native recovery is implemented in source and both platforms bundle; provider, on-device Hermes,
  lifecycle, and backup acceptance remain unverified.
- Provider coverage and model capability remain explicit; unsupported combinations fail before
  execution rather than selecting a second conversation runtime.

## Documents

| Document | Source of truth for |
| --- | --- |
| [Pi Durable Migration](./pi-durable-migration.md) | Active experimental runtime, history authority, lifecycle, legacy handoff, operations, and backup |
| [Agent Protocol](./agent-protocol.md) | Application values, operations, events, snapshots, errors, and invariants |
| [Agent Runtime](./agent-runtime.md) | Historical per-turn contract |
| [Agent Persistence](./agent-persistence.md) | Cherry business/legacy schema and historical store behavior |
| [Agent Tools And Controlled Resources](./agent-tools-and-resources.md) | System capabilities, MCP bindings, approvals, managed files, and artifacts |
| [Built-In MCP Integrations](./built-in-mcp-design.md) | Current GitHub, Amap and Feishu cloud MCP connectors, Feishu browser authorization and the six-platform scope |
| [Built-In MCP Roadmap](./built-in-mcp-roadmap.md) | Implemented authorization and bundled guides; future multi-account, HTTP reuse and Skill designs |
| [Plugin Expansion Research](./plugin-expansion-research.md) | Official hosted-service availability, Feishu personal authorization, and CLI-to-JavaScript feasibility |
| [Agent Skills](./agent-skills.md) | Bundled plugin guide boundary and deferred general Mobile Skill policy |

## Related

- [Backend AI Target Architecture](../ai/target-architecture.md) — approved target structure, seam
  rules, and migration status for `src/backend/ai`
- [Architecture Overview](../architecture-overview.md) — dependency direction and layer ownership
- [Runtime Ownership](../runtime-ownership.md) — Host lifetime, observation, and shutdown
- [Chat Streaming And Rendering](../chat/streaming-and-rendering.md) — transcript windows, live
  projection, and rendering
- [`@cherrystudio/ai-runtime`](../../../packages/ai-runtime/README.md) — portable provider and message
  helpers; it is not the local Agent Runtime
