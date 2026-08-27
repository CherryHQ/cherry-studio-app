# Mobile AI Adapters

Portable AI behavior lives in the private source package `@cherrystudio/ai-runtime`. This directory
owns the mobile platform and application-service boundaries around that package.

## Backend Ownership

- `AiService.ts` owns non-conversation generation, model listing, model checks, and image generation.
  Callers supply an explicit `uniqueModelId`; it does not resolve Agent state or stream chat turns.
- `agent/` owns the independent Agent Runtime contract, its FakeRuntime test double, and the Pi
  Runtime implementation (`docs/references/agent/agent-runtime.md`). This boundary must not import
  application protocol types, persistence, React, or Expo modules (ESLint-enforced).
- `agentHost/` owns the Mobile Agent Host: the only adapter between the Agent Protocol
  (`@/shared/contracts/agent`) and the Runtime contract, plus the Agent definition source and the
  production Pi provider/model resolution adapter. Version 1 binds `local` directly to Pi without
  a Runtime registry or implementation router.
- `provider/` resolves credential-selection-free connection facts shared by Pi and AI SDK request
  construction, materializes the shared language serving plan and typed compatibility result, owns
  shared Provider HTTP transport policies, injects Expo environment values and app headers, then
  builds AI SDK provider configuration from mobile data services. Image execution consumes shared
  connection facts but bypasses the language plan.
- `runtime/aiSdk/` builds the AI SDK request parameters used by `AiService`; it is not a conversation
  runtime and owns no persisted turn state.
- `mcp/` owns the mobile Streamable HTTP transport, connection lifecycle, server status, and tool
  discovery used by MCP settings.
- `hooks/` connects portable usage semantics to the mobile billing record service.
- `utils/` contains only the Expo UUID and mobile prompt-environment adapters.

Pure provider implementations, request types, and parameter policies must not be duplicated here.

Current execution and tool boundaries live in
[Agent Architecture](../../../docs/references/agent/README.md) and
[Agent Tools And Controlled Resources](../../../docs/references/agent/agent-tools-and-resources.md).

## Sync Trust

`packages/ai-runtime/desktop-sync-map.json` retains the complete desktop and historical mobile
inventories. Run the package check with a clean desktop checkout before treating a port as trusted:

```bash
pnpm --filter @cherrystudio/ai-runtime check
pnpm --filter @cherrystudio/ai-runtime ai-runtime:check --desktop-root <desktop-root>
```

The implemented-port check passes independently while the broader desktop audit continues to report
the classified blocked backlog. Do not convert an unexplained desktop gap into an exclusion.
