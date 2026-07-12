# Cherry Mobile Extension Points

Status: current

This document maps where future feature domains — drawing/canvas and cloud agent are the motivating examples — attach to the existing mobile architecture. It is a placement guide, not a design or a commitment to build these features. Terms follow [CONTEXT.md](../../CONTEXT.md).

## Principle: Follow Existing Seams, Not New Registries

Mobile deliberately omits the desktop feature/plugin registries. AI tools and request plugins are assembled inline (see the "no feature registry here" notes in `src/ai/AiService.ts` and `src/ai/runtime/aiSdk/Agent.ts`), settings sections are hardcoded JSX, and services are wired by plain constructor injection with no DI container. Extending a feature means adding to these existing seams. Reintroducing the desktop `RequestFeature`-style registry is the sanctioned move only once inline assembly stops scaling — not a prerequisite for the first version of a new feature.

The `web_search` subsystem (`src/services/webSearch/`) is the best full-stack precedent to mirror: it spans a driver registry (`providers/registry.ts`), a factory (`providers/factory.ts`), a service in the graph (`WebSearchService`, wired in `createDataServices.ts`), an AI-layer tool (`src/ai/createWebSearchTool.ts`), a message-part renderer, and settings screens/routes under `src/app/settings/websearch/`.

## Data Layer (`src/data`)

- **Service graph**: register a new service in `createDataServices.ts` (the single assembly point); it becomes reachable through `useDataServices()`. Cold-start rehydration hooks belong in `runPostReadyTasks` (`src/data/bootstrap/appRuntime.ts`), off the startup gate.
- **New tables**: add a Drizzle file under `src/data/db/schemas/`, register it in `schemas/index.ts`, and generate a migration per `src/data/db/schemas/README.md`. A relation to a not-yet-migrated domain follows the partial-stub pattern in `assistantRelations.ts` (FK to the absent domain omitted until it lands).
- **New message content** (e.g. a drawing result): add a key to `CherryDataPartTypes` in `src/data/types/uiParts.ts` and register its metadata in the same file's part-schema table. Message parts are stored as a JSON `parts[]` blob on `message.data`, so a new non-text part needs no schema migration; note FTS only indexes `type === 'text'` parts.

**Drawing**: results as message parts → new `CherryDataPartTypes` key, no new table. Standalone drawing documents → a new schema file + `schemas/index.ts` entry.

**Cloud agent**: a new `agentSession` table (schema file + `schemas/index.ts`), a relation stub modeled on `assistantRelations.ts`, a `CloudAgentService` in `createDataServices.ts`, and optional cold-start session rehydration in `runPostReadyTasks`.

## AI Layer (`src/ai`)

- **App-level tools**: assembled inline in `AiService.buildAgentParamsFor` (`src/ai/AiService.ts`) alongside `createWebSearchTool`. A new model-invocable tool is added as another `ToolSet` entry there, following the `createWebSearchTool` factory shape.
- **Request plugins**: `buildAgentPlugins` in `src/ai/AiService.ts` is a hand-written ladder; add a branch there.
- **Provider capabilities**: the extensible provider system is `extensionRegistry` from `@cherrystudio/ai-core`, fed by `ProviderExtension.create(...)` factories in `src/ai/provider/extensions/`. A provider-native tool capability requires adding a literal to the `ToolCapability` union in `@cherrystudio/ai-core` — a cross-package choke point — plus a `providerToolPlugin(...)` call in `buildAgentPlugins`.

**Drawing**: image generation already has a first-class entry (`AiService.generateImage` + `isGenerateImageModel`); a draw flow extends `AiService` similarly or adds an app tool. A provider-native canvas tool hits the `ToolCapability` union choke point.

**Cloud agent**: a new `AiService` method (peer of `streamText`) or a `runtime/aiSdk/` session class beside `Agent` (which explicitly disclaims agent-session support). `createAgent` from `@cherrystudio/ai-core` is the core primitive.

## UI Layer (`src/screens`, `src/components`, `src/app`)

- **Routes**: file-based under `src/app/`. A full-screen surface is a new route (or drawer/stack group); wrap it in its own runtime provider if it owns long-lived resources, mirroring `ChatRuntimeProvider`.
- **Message rendering**: the dispatch is a hand-written switch in `src/screens/ChatScreen/messageContent/components/MessagePart.tsx` with an `UnknownPart` fallback. A new part renders by adding a `case 'data-<type>'` there plus a focused renderer component (mirror `VideoPart`/`CodePart`), per that module's README.
- **Settings**: `SettingsScreen.tsx` composes hardcoded `SettingsSection` blocks; a new feature adds an item there plus a route file under `src/app/settings/`.

**Drawing**: `DrawingPart.tsx` + a `case 'data-drawing':` in `MessagePart.tsx`; optionally a full canvas route.

**Cloud agent**: a new screen/route with its own runtime provider (modeled on `ChatRuntimeProvider`), plus a settings entry.

## Reopen When

- Inline tool/plugin assembly in `AiService` grows enough to justify reintroducing a feature registry.
- A new feature needs a runtime tier that the flat layout can no longer keep legible (see ADR 0009).
