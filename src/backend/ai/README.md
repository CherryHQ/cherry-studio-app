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
- `provider/` injects Expo environment values and app headers, then builds provider configuration
  from mobile data services.
- `runtime/aiSdk/` builds the AI SDK request parameters used by `AiService`; it is not a conversation
  runtime and owns no persisted turn state.
- `mcp/` owns the mobile Streamable HTTP transport, connection lifecycle, server status, and tool
  discovery used by MCP settings.
- `hooks/` connects portable usage semantics to the mobile billing record service.
- `utils/` contains only the Expo UUID and mobile prompt-environment adapters.

Pure provider implementations, request types, and parameter policies must not be duplicated here.

## Pi-First Direction

Pi is the sole owner of local conversation execution. The Mobile Agent Host owns Agent
configuration, structured transcript persistence, cancellation, and protocol projection. Version 1
resolves an empty tool snapshot for every turn; `tools: []` is ordinary conversation, and
configured tools are adapted from the application-owned contract into Pi tools when tool bindings
land. AI SDK may continue to serve non-conversation model capabilities behind those
application-owned tools, but it must not become a parallel conversation runtime. Pi never imports
AI SDK or application services directly: a `RuntimeTool` callback closes over the narrow capability
adapter, and generated output returns as a managed artifact. See
`docs/references/agent/agent-tools-and-resources.md` and
`docs/references/agent/agent-skills.md`.

## Sync Trust

`packages/ai-runtime/desktop-sync-map.json` retains the complete desktop and historical mobile
inventories. Run the package check with a clean desktop checkout before treating a port as trusted:

```bash
pnpm --filter @cherrystudio/ai-runtime check
pnpm --filter @cherrystudio/ai-runtime ai-runtime:check --desktop-root <desktop-root>
```

The implemented-port check passes independently while the broader desktop audit continues to report
the classified blocked backlog. Do not convert an unexplained desktop gap into an exclusion.
