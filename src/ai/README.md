# Mobile AI Adapter

Mobile AI service layer migrated from the desktop `src/main/ai` shape. This directory adapts the
desktop AI concepts to the in-process Expo app runtime.

## Scope

- `AiService.ts` is the app-facing AI service registered in the mobile data runtime.
- `mcp/` owns the mobile Streamable HTTP MCP runtime, tool policies, and AI SDK adaptation.
- `provider/` converts stored provider and model settings into AI SDK provider config.
- `runtime/aiSdk/Agent.ts` keeps the desktop agent filename while narrowing behavior to plain AI SDK
  generate and stream calls.
- `messages/` converts app messages into AI SDK message shapes.
- `types/` and `utils/` hold request types, merged provider types, and provider option helpers.

## Mobile Notes

- File and directory names intentionally follow the desktop AI layer where practical.
- This layer should call `packages/ai-core` instead of depending on desktop Electron services.
- Streaming is available through `AiService.streamText()`.
- Non-streaming generation is available through `AiService.generateText()`.
- Desktop IPC handlers, stream managers, local MCP transports, and full agent sessions are not part
  of the current mobile slice.

## Organization

```text
AiService.ts
mcp/            # Streamable HTTP MCP runtime and AI SDK tool adaptation
messages/       # message and file-part conversion
provider/       # provider config, endpoint, factory, extensions
runtime/aiSdk/  # AI SDK agent adapter
types/          # request and provider type glue
utils/          # provider/model option helpers
```
