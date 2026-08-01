# Mobile AI Adapter

Mobile AI service layer migrated from the desktop `src/main/ai` shape. This directory adapts the
desktop AI concepts to the in-process Expo app runtime.

## Scope

- `AiService.ts` is the AI entry point registered in the private backend service graph.
- `mcp/` owns the mobile Streamable HTTP MCP runtime, tool policies, and AI SDK adaptation.
- `provider/` converts stored provider and model settings into AI SDK provider config.
- `runtime/aiSdk/Agent.ts` keeps the desktop agent filename while narrowing behavior to plain AI SDK
  generate and stream calls.
- `messages/` converts app messages into AI SDK message shapes.
- `streamManager/` owns a chat turn end to end: `ChatSessionImpl` drives the turn, tracks abort and
  tool-approval state, and persists the assistant message; `topicNaming`, `normalizeCitations`, and
  `MessageRuntimeTimingCollector` handle the surrounding concerns.
- `types/` and `utils/` hold request types, merged provider types, and provider option helpers.

## Mobile Notes

- File and directory names intentionally follow the desktop AI layer where practical.
- This layer should call `packages/ai-core` instead of depending on desktop Electron services.
- Streaming is available through `AiService.streamText()`.
- Non-streaming generation is available through `AiService.generateText()`.
- Desktop IPC handlers, local MCP transports, and full agent sessions are not part of the current
  mobile slice.
- `streamManager/` collapses desktop's split between the Main-process `AiStreamManager` and the
  renderer's `Chat`/overlay: one process means listener fan-out becomes an in-memory snapshot, and
  the ContextProvider strategies become methods. Persistence timing still matches desktop — the
  assistant row is written only on a terminal state.

## Organization

```text
AiService.ts
mcp/            # Streamable HTTP MCP runtime and AI SDK tool adaptation
messages/       # message and file-part conversion
provider/       # provider config, endpoint, factory, extensions
runtime/aiSdk/  # AI SDK agent adapter
streamManager/  # chat session runtime: turn orchestration, persistence, topic naming, timing
types/          # request and provider type glue
utils/          # provider/model option helpers
```
