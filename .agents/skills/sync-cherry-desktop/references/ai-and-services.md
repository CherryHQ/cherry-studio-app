# AI And Services

## Enforce Exact Package Mirrors

Compare sorted Git-tracked file sets and path-plus-content SHA-256 for desktop `packages/aiCore/` against mobile `packages/ai-core/`, and for both `packages/ai-sdk-provider/` trees. Mirror source, tests, configuration, package metadata, and documentation byte for byte. Treat any file-set or byte difference as drift; allow no semantic shortcut or unrecorded packaging exception.

## Port Provider Registry Behavior

Align provider/model catalogs, schemas, aliases, endpoint matrices, creators and factories, capability and reasoning controls, generated data, defaults, and tests in `packages/provider-registry/`. Retain only the narrow mobile loading adapter needed by Metro. Prove equivalent catalog content and behavior instead of treating similar file names or counts as parity.

Trace every provider/model change through registry, seed data, persisted schema, AI configuration, service behavior, icons, settings, tests, and i18n. Include dependency versions and patches that change provider behavior.

## Trace The AI Runtime

Follow each ordinary chat request through shared assistant/provider/model/message types, request and stream contracts, endpoint and credential resolution, provider extensions, parameter assembly, system prompts, capabilities, reasoning controls, telemetry, hooks, tool loop, cancellation, errors, usage observers, terminal state, attachments, file handling, MCP resolution, persisted result conversion, chat/session services, frontend input, and stream consumption.

Require every desktop input and state transition to reach the mobile provider boundary, including reasoning effort, fast mode, selected MCP tools, call overrides, abort signals, and provider-specific options. Add contract tests for outputs, errors, ordering, retries, cancellation, tool termination, and stream lifecycle.

Exclude only these application-level Agent paths declared by the Manifest:

- `src/main/ai/agentSession/**`
- `src/main/ai/agents/**`
- `src/main/ai/observability/adapters/claudeCode/**`
- `src/main/ai/runtime/claudeCode/**`
- `src/main/ai/tools/adapters/claudeCode/**`

Synchronize ordinary chat `src/main/ai/runtime/aiSdk/Agent.ts` and `packages/aiCore/**/agents/createAgent.ts`. Do not infer an exclusion from the word `Agent`. For channels, inference, observability, stream management, local MCP, browser, file tools, or any other non-Agent gap, implement it, prove an existing equivalent, or classify the domain as `blocked` with evidence.

## Port Used Services And Shared Code

Compare every desktop service reached by mobile composition roots and features, plus transitive shared types and utilities. Cover web search, CherryIN OAuth, topic naming, provider/model management, MCP, paintings, files, profile storage, and newly discovered common services.

- Preserve inputs, outputs, error mapping, redaction, retries, cancellation, timeouts, lifecycle/disposal, region behavior, and security checks.
- Place Electron, Node filesystem/network/credential, and browser-session differences behind narrow Expo or React Native adapters.
- Match web-search provider coverage, validation, raw fetch behavior, post-processing, blacklist rules, headers, and regional hosts.
- Match topic-name gating, prompt, result, and persistence behavior; exclude only its explicit Product Agent session branch.
- Match OAuth REST payloads, refresh behavior, error mapping, and token redaction while retaining Expo browser/session integration.
- Persist all MCP transports and project only `streamableHttp` into mobile runtime capabilities.

## Align Dependencies Deliberately

Compare root and package dependency ranges, lockfile resolutions, AI SDK patches, Metro/export behavior, and peer requirements together. Do not copy the desktop lockfile or Node-only dependencies into Expo. Prove the smallest compatible resolution with package tests plus production iOS and Android exports. Identical patch files do not prove differently resolved versions behave identically.
