# Mobile AI Adapters

Portable AI behavior lives in the private source package `@cherrystudio/ai-runtime`. App code may
use only its `messages`, `provider`, `runtime`, `tools`, and `utils` subpaths. This directory owns
the mobile platform and application-service boundaries around that package.

## Backend Ownership

- `AiService.ts` is the private backend AI entry point and preserves its existing app contract.
- `agent/` owns the independent Agent Runtime contract, its FakeRuntime test double, and the
  transitional AI SDK Runtime implementation (`docs/references/agent/agent-runtime.md`). The target
  production implementation is Pi only. This boundary must not import application protocol types,
  persistence, React, or Expo modules (ESLint-enforced).
- `agentHost/` owns the Mobile Agent Host: the only adapter between the Agent Protocol
  (`@/shared/contracts/agent`) and the Runtime contract, plus the Agent definition source and the
  production `resolveModel` composition. It still contains the earlier AI SDK Runtime Router and
  registry slice; Pi-first integration replaces those with direct Pi Runtime composition.
- `provider/` injects Expo environment values and app headers, then builds provider configuration
  from mobile data services.
- `runtime/pi/` owns the current transitional Topic Chat bridge from Pi events to the existing
  `UIMessageChunk` stream. It is text/reasoning-only and is not yet the formal Pi Agent Runtime.
- `runtime/aiSdk/` retains the current fallback Agent construction and request parameter
  orchestration that needs Expo Crypto, preferences, provider services, tools, and logging. It is
  not the target local Agent engine.
- `streamManager/` owns chat lifecycle, persistence, topic naming, approval state, and snapshots.
- `messages/` resolves managed and device-local attachments through Expo FileSystem.
- `mcp/` owns the mobile Streamable HTTP transport, connection lifecycle, and runtime projection.
- `tools/` owns the device scope, diagnostics adapter, ToolResolver, Web tools, and Calendar,
  Health, Location, and Reminder implementations.
- `hooks/` connects portable usage semantics to the mobile billing record service.
- `utils/` contains only the Expo UUID and mobile prompt-environment adapters.

Pure message rules, provider implementations, request types, parameter policies, tool registry and
meta-tools, loop plugins and observers, prompts, and stream helpers must not be duplicated here.

## Pi-First Direction

Pi is the sole target owner of local conversation state and the model/tool loop. The Mobile Agent
Host owns Agent configuration, structured transcript persistence, permissions, approval policy, and
the immutable tool snapshot injected for each turn. `tools: []` is ordinary conversation;
configured tools are adapted from an application-owned contract into Pi tools. AI SDK may continue
to serve non-Agent generation and provider utilities, but it must not become a parallel Chat Runtime.

## Sync Trust

`packages/ai-runtime/desktop-sync-map.json` retains the complete desktop and historical mobile
inventories. Run the package check with a clean desktop checkout before treating a port as trusted:

```bash
pnpm --filter @cherrystudio/ai-runtime check
pnpm --filter @cherrystudio/ai-runtime ai-runtime:check --desktop-root <desktop-root>
```

The implemented-port check passes independently while the broader desktop audit continues to report
the classified blocked backlog. Do not convert an unexplained desktop gap into an exclusion.
