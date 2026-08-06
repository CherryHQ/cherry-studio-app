# Pi Agent on mobile

Cherry Studio App can run a [Pi](https://github.com/earendil-works/pi) coding-agent runtime locally on device — no server, no self-hosting, no cloud compute.

## How it works

The [@earendil-works/pi-agent-core](https://www.npmjs.com/package/@earendil-works/pi-agent-core) package provides the agent runtime: the stateful agent loop, context compaction, tool orchestration and session state. Its core entry is runtime-agnostic (no Node builtins), so it runs directly inside React Native's Hermes engine.

This repository wires that runtime into Cherry's existing stack:

| Concern | Implementation |
| --- | --- |
| Agent runtime | `@earendil-works/pi-agent-core` (`src/agent/AgentService.ts`) |
| Model transport | `src/agent/streamBridge.ts` — implements pi's `StreamFn` on top of Cherry's AI SDK providers (`providerToAiSdkConfig` + `createAiSdkProvider` + `streamText`) |
| Device tools | `src/agent/toolAdapter.ts` — adapts Cherry's existing `SystemTool` set (reminders, calendar, time, fetch, shortcuts) into pi `AgentTool`s |
| Message protocol | `src/agent/messageBridge.ts` — converts pi `AgentMessage` ↔ AI SDK `ModelMessage` |
| UI | `src/agent/usePiAgent.ts` + `src/screens/agent/AgentScreen.tsx` — streams agent events (text deltas + tool execution traces) into the chat UI |

The agent entry lives in the drawer (Sparkles icon). Pick a function-calling model and start describing tasks.

## Why device-local

- **BYOK economics**: the user's own API key pays for the model calls; no Cherry-hosted agent loop, so a free/open-source project carries no inference cost.
- **Privacy**: the agent state, tool execution and any files it touches stay on the device.
- **Phone-only capabilities**: the tool surface is the device itself — reminders, calendar, shortcuts, local notifications — which cloud agents cannot reach.

## Scope & limitations

- The tool set currently mirrors the existing `SystemTool` set used by chat function calling; adding more phone capabilities is a matter of adding new `AgentTool`s.
- `beforeToolCall` permission gating is available in the runtime but not yet wired to a confirmation UI — follow-up work.
- Background `schedule` execution is limited on iOS/Android (the app cannot run the agent while suspended); scheduling surfaces as a local notification + deferred run on next open.
