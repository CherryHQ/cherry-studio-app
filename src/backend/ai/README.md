# Mobile AI Adapters

Portable AI behavior lives in the private source package `@cherrystudio/ai-runtime`. This directory
owns the mobile platform and application-service boundaries around that package.

## Backend Ownership

- `AiService.ts` owns non-conversation generation, model listing, model checks, and image generation.
  Callers supply an explicit `uniqueModelId`; it does not resolve Agent state or stream chat turns.
- `generation/` owns non-conversation AI SDK request assembly, execution, and mobile usage capture
  used by `AiService`. It owns no persisted turn state.
- `agent/runtime/` owns the independent Agent Runtime contract, its FakeRuntime test double, and the
  Pi Runtime implementation (`docs/references/agent/agent-runtime.md`). This boundary must not
  import application protocol types, persistence, React, or Expo modules (ESLint-enforced).
- `agent/host/` owns the Mobile Agent Host, the only adapter between the Agent Protocol
  (`@/shared/contracts/agent`) and the Runtime contract, plus Agent definition and protocol
  projection policy. The concrete Runtime enters through the composition root's `AgentRuntime`
  registration; the Host never constructs one.
- `agent/sessionStore/`, `agent/resources/`, `agent/tools/`, and `agent/piAdapter/` respectively own
  transcript persistence, managed turn resources, executable Agent capabilities, and the mobile
  provider/model adaptation required to construct Pi.
- `provider/` resolves credential-selection-free connection facts shared by Pi and AI SDK request
  construction, owns shared Provider HTTP transport policies and the runtime-agnostic system model
  support factory, injects Expo environment values and app headers, then builds AI SDK provider
  configuration from mobile data services. The Pi language compatibility decision lives in
  `agent/piAdapter/`, behind the Runtime binding.
- `mcp/` owns the mobile Streamable HTTP transport, connection lifecycle, server status, and tool
  discovery used by MCP settings.
- `devBench/` owns development-only provider fixtures and benchmark request helpers.

Pure provider implementations, request types, and parameter policies must not be duplicated here.

Current execution and tool boundaries live in
[Agent Architecture](../../../docs/references/agent/README.md) and
[Agent Tools And Controlled Resources](../../../docs/references/agent/agent-tools-and-resources.md).
The approved target structure and migration status for this directory live in
[Backend AI Target Architecture](../../../docs/references/ai/target-architecture.md).
