# Shared Workflow Contracts

This directory defines the frontend-visible interface of backend workflow modules. `Backend` is
the aggregate interface, and `BackendProvider` exposes one of its modules through
`useBackendModule(key)`. Implementations live in the owning backend domain under
`src/backend/services` or `src/backend/ai`; production assembly lives in `src/bootstrap`.

The interface is in-process. It does not define IPC, HTTP, a native bridge, serialization, security
isolation, or a second runtime. Contract values may therefore include `AbortSignal`, callbacks,
subscriptions, errors, and session objects when those shapes make the workflow interface deeper.

## The Three Frontend Seams

Choose the narrowest existing seam. A frontend capability must not be exposed through more than one
of these paths.

| Need | Location | Frontend entry point |
| --- | --- | --- |
| Resource reads, writes, pagination, and CRUD | `src/shared/data/api` | Typed `useQuery`, `useMutation`, or `useInfiniteQuery` hooks |
| Preference reads, writes, and subscriptions | `src/shared/data/preference` | `usePreference` or `useMultiplePreferences` |
| Multi-step workflows, sessions, and backend-owned capabilities | `src/shared/contracts` | `useBackendModule(key)` |

Resource operations remain Data API endpoints even when their implementations use SQLite or a
backend data module. Do not add a `Backend` module merely to avoid defining an endpoint.
Imperative reads and custom history windows use the public `useApiClient` entry under the
[frontend data contract](../../frontend/data/README.md); they remain on the resource seam and own
their cancellation, query keys and cache policy.

The credential-free `remoteAgent` workflow exposes source reads, observations and bound command
results. Desktop transport, grants and recovery remain backend-owned; frontend conversation
consumption lives in appShell. See [Remote Access](../../../docs/references/remote-access/README.md).
The superseded `agentController` contract is removed.

## Admission Rules

A new contract belongs here only when it cannot be expressed cleanly through the Data API or
preference interface and at least one of these conditions applies:

1. It coordinates multiple backend dependencies or business steps behind one frontend operation.
2. It exposes a backend-owned runtime or caller-owned session with state, subscriptions,
   cancellation, or disposal.
3. It encapsulates a platform, filesystem, native, AI, or third-party capability whose concrete
   implementation must remain backend-owned.
4. It returns workflow outcomes or emits events that let the frontend perform its own navigation,
   cache invalidation, or user feedback without importing backend implementation details.

The interface must hide meaningful complexity. A one-to-one interface over a persistence method,
SDK function, or existing endpoint is a pass-through and must not be added here. Prefer extending an
existing module over creating another aggregate member.

Use the deletion test during review: if deleting the proposed module only removes a forwarding
method, it is too shallow. If deleting it would spread orchestration, lifecycle management, or
platform knowledge across frontend callers, the module is earning its place.

## Content Rules

Contracts may contain:

- frontend-callable module and session interfaces;
- workflow input, output, result, snapshot, event, and listener types;
- stable discriminated unions used to represent workflow state or outcomes;
- frontend-actionable error types and type guards;
- constants that are part of the workflow interface;
- references to shared entities and value types instead of duplicate representations.

Contracts must not contain:

- Agent, Agent Session, message, file, model, provider, painting, or MCP persistence CRUD;
- endpoint paths, query keys, pagination infrastructure, or React Query options;
- preference keys, defaults, schemas, clients, or subscription implementations;
- Drizzle schemas, database rows, migrations, SQL, repositories, or persistence classes;
- concrete AI SDK, MCP SDK, filesystem, cache, or native-module implementations;
- React contexts, providers, hooks, components, Expo Router navigation, toast, or translation logic;
- bootstrap composition, dependency graphs, service construction, or lifecycle startup code;
- backend-private dependency interfaces used only to construct or test an implementation;
- transport channels, serialized envelopes, request IDs, IPC handlers, or HTTP concerns;
- speculative interfaces for hypothetical transports or reuse.

Place shared entities, DTOs, and value types in `src/shared/data`. Place cross-layer pure helpers in
`src/shared/utils`. Place implementation-only types beside their owner in `src/backend` or
`src/frontend`.

## Dependency Rules

Contracts are a lower-layer seam and must remain platform-neutral:

- They may depend on platform-neutral modules under `src/shared` and shared workspace packages.
- They must never import from `src/app`, `src/bootstrap`, `src/frontend`, or `src/backend`.
- They must never import React, React Native, Expo, native-module wrappers, database libraries, AI
  SDK implementations, or integration implementations.
- They must not expose concrete backend classes, database rows, SDK response objects, or adapter
  configuration objects in public method signatures.
- They should reuse `src/shared/data` types when the same concept already exists there.

These restrictions are enforced in part by ESLint. The README remains the review standard for
semantic rules that import restrictions cannot detect, especially shallow pass-through interfaces.

## Interface Design Rules

- Name aggregate members by capability (`agent`, `models`, `permissions`), not by storage table or
  implementation class.
- Use one leaf file per capability. Define the aggregate and module-key helpers only in
  `backend.ts`; re-export the public surface from `index.ts`.
- Name leaf contracts `XxxModule` and caller-owned lifecycle objects `XxxSession`. Keep the aggregate
  name `Backend` and its capability keys unchanged.
- Prefer one operation that owns a complete workflow over exposing every internal step.
- Put cancellation on its owner, such as `cancelGeneration(jobId)` on `PaintingsModule` or
  `cancel()` on a caller-owned session.
- Sessions that own resources, subscriptions, or in-flight work must expose `dispose()` and define
  who owns calling it.
- Return structured results or emit semantic events. Do not perform routing, translation, toast, or
  React Query cache updates in backend implementations.
- Events may request a frontend-owned effect such as opening a Session or invalidating resource data,
  but must not carry Router, QueryClient, React, or component references.
- Expose only errors that require distinct frontend handling. Error messages must not be localized
  UI copy.
- Keep implementation dependencies private. Constructor dependency interfaces belong beside the
  backend implementation, not in this directory.
- Do not add serialization schemas unless a real transport is introduced through a separate
  architecture decision.

## Current Modules

The 20 keys in [`Backend`](./backend.ts) are public capabilities, not 20 lifecycle services.
Host-owned resources stop with `ApplicationHost`; ordinary module calls use their caller's lifetime.
Private disposers stay with bootstrap, and callers release their own observations and sessions.

| Module | Workflow and implementation owner | State and release ownership |
| --- | --- | --- |
| `agent` | `MobileAgentHost` / `DurableAgentHost`: local conversation admission, branches, approvals and execution projection | Host-owned execution; Cherry owns durable transcripts. Route observation release does not cancel turns |
| `remoteAgent` | `RemoteAgentRuntime`: remote reads, observations and command recovery | Host-owned scopes; callers dispose retained sources. Desktop remains the execution and history authority |
| `desktopConnections` | `DesktopConnectionRuntime`: pairing, credentials and configuration import | Host-owned requests and credential operations; connection leases belong to `DesktopConnectionManager` |
| `skills` | `createSkillsModule`: discovery, validation and installation | Caller-cancelled preparation; bootstrap's private `disposeSkills` rejects and drains admitted publication writes |
| `translation` | `createTranslationModule`: language/model selection and one text-generation invocation | Per-call cancellation; no conversation or tool-loop lifetime |
| `models` | `createModelsModule`: model pull, preview, reconcile and health checks | Per-call deadlines and cancellation; model records remain Data API resources |
| `providers` | `createProvidersModule`: provider policy, presets, avatars, registry updates and account workflows | Calls delegate persistent state and long-lived work to their existing data, registry and account owners |
| `webSearch` | `WebSearchService`: external-provider connectivity checks; also serves internal Agent search calls | Host-owned API-key rotation; requests belong to individual calls |
| `file` | `fileContent`: managed-file import, URI resolution, attachment preparation, preview, editing and trash admission | Module-level adapter; operation/observer cancellation belongs to callers. Shared PDF extraction retains one request until its last consumer releases it |
| `paintings` | `createPaintingsModule`: atomically creates receipts and jobs, cancels generation and resolves files | `JobRuntime` owns execution and recovery beyond the route; receipts and jobs are durable resources |
| `documentExport` | `DocumentExportRuntime`: export sessions and HTML conversion | Caller-owned `DocumentExportSession.dispose()`; host stop drains remaining sessions |
| `systemEntry` | `createSystemEntryModule`: claims native shares, imports files and acknowledges staging | Bootstrap's private `disposeSystemEntry` cancels/drains claims; a delivered draft belongs to the composer |
| `mcp` | `McpRuntimeService`: shared connections, OAuth, discovery, resources, prompts and Apps | Host-owned connections/auth attempts; callers close App views and observations without cancelling other Agent work |
| `plugins` | `createPluginsModule`: credentials, authorization and connection coordination | Per-plugin operation queues; `McpRuntimeService` owns authorization and connection lifetimes |
| `permissions` | `DevicePermissions`: system permission queries, serialized prompts and settings recovery | Module-level native prompt queue; an open system prompt retains its slot until native completion |
| `backgroundExecution` | `KeepAliveCoordinator`: background protection status, settings and observation | Host-owned platform sources; backend consumers acquire/release execution leases |
| `backup` | `BackupRuntime`: capture, validation, staging and restore with storage admission | Host-owned operation and staged restore; explicit cancellation and host stop settle accepted work |
| `diagnostics` | `DiagnosticBundleService`: metadata inspection, archive creation, saving and upload | Host-owned in-flight operation; host stop cancels and joins it. Process log recording has a separate lifetime |
| `appUpdate` | `createAppUpdateModule`: channel routing, release discovery, APK transfer and installation | App-owned download; bootstrap's private `disposeAppUpdate` cancels/drains it. Closing a dialog does not cancel the download |
| `profile` | `createProfileModule`: avatar storage and preference coordination | Per-call replacement; preferences and avatar bytes retain their own storage owners |

Ordinary persistence for these resource families still belongs to the Data API. For example, model
CRUD is a Data API concern while model pull and health checks are workflow contracts.
Implementation modules live under `backend/services`, except local Agent and MCP execution under
`backend/ai`. The private [service registry](../../backend/core/application/serviceRegistry.ts)
also contains owners such as `JobRuntime` that do not need a separate public `Backend` key.

For each capability change, identify the public entry, business-rule owner, durable source of truth,
in-flight lifetime, cancellation/disposal owner, and structured failure result. A second entry point
reuses those rules while retaining its own authorization and presentation responsibilities.

## Adding Or Changing A Contract

1. Confirm that an existing Data API endpoint, preference operation, or contract module cannot own
   the behavior cleanly.
2. Define the smallest frontend-visible interface and reuse existing shared data types.
3. Put the implementation in its owning `src/backend/services` or `src/backend/ai` domain and keep
   private dependency interfaces there.
4. Assemble the production implementation in `src/bootstrap/composition/createBackend.ts`.
5. Consume it through `useBackendModule(key)`; keep frontend effects in the owning feature or hook.
6. Test the backend implementation through the contract's observable behavior.
7. Test frontend consumers with a fake module supplied through the real `BackendProvider`.
8. Update the current-module table when adding or removing an aggregate capability.

Before approval, reviewers should be able to answer all of the following with "yes":

- Does the interface hide orchestration, lifecycle, platform, or third-party complexity?
- Would a Data API endpoint or preference operation be a worse semantic fit?
- Can the frontend use it without knowing a concrete backend class or SDK?
- Are navigation, cache updates, translation, and user feedback still frontend-owned?
- Can production and fake implementations satisfy the same interface?
- Is every exported type necessary for a frontend caller or contract-level test?

See the [Architecture Overview](../../../docs/references/architecture-overview.md) and
[Extending Cherry Mobile](../../../docs/guides/extending.md) for the surrounding architecture.
