# aiCore Porting Summary

## Completed Work

### Source Information

- **Upstream Repository**: https://github.com/CherryHQ/cherry-studio
- **Latest Commit Ported**: `28bc89ac7ccd9acf502f9e564848ed1530a7b373`
- **Commit Range**: HEAD~100..HEAD (last 100 commits)
- **Total Changes**: 2868 lines across 70 files

### Files Ported

#### New Files Added (16 files)

1. `src/aiCore/chunk/handleToolCallChunk.ts`
2. `src/aiCore/legacy/clients/__tests__/ApiClientFactory.test.ts`
3. `src/aiCore/legacy/clients/__tests__/index.clientCompatibilityTypes.test.ts`
4. `src/aiCore/legacy/clients/anthropic/AnthropicVertexClient.ts`
5. `src/aiCore/legacy/clients/aws/AwsBedrockAPIClient.ts`
6. `src/aiCore/legacy/clients/cherryai/CherryAiAPIClient.ts`
7. `src/aiCore/legacy/clients/gemini/VertexAPIClient.ts`
8. `src/aiCore/legacy/clients/ovms/OVMSClient.ts`
9. `src/aiCore/middleware/noThinkMiddleware.ts`
10. `src/aiCore/middleware/openrouterGenerateImageMiddleware.ts`
11. `src/aiCore/middleware/qwenThinkingMiddleware.ts`
12. `src/aiCore/middleware/toolChoiceMiddleware.ts`
13. `src/aiCore/plugins/telemetryPlugin.ts`
14. `src/aiCore/provider/providerInitialization.ts`
15. `src/aiCore/tools/KnowledgeSearchTool.ts`
16. `src/aiCore/trace/AiSdkSpanAdapter.ts`

#### Modified Files (54 files)

All files in the upstream diff have been updated with the latest code changes, including:

- Chunk handling improvements
- Middleware enhancements
- Client updates for various providers
- Parameter preparation logic
- Utility function improvements

### Import Transformations Applied

All files were automatically transformed with the following replacements:

```bash
@renderer/**  →  @/**
@logger  →  @/services/LoggerService
@shared/config/constant  →  @/constants
@shared/anthropic  →  @/aiCore/provider/config/anthropic
@shared/utils  →  @/utils
```

### Key Code Changes

1. **Error Handling**: Added AISDKError support in chunk processing
2. **Tool Call Processing**: Enhanced tool call chunk handling with better image extraction
3. **Reasoning Logic**: Updated reasoning effort calculations for various models
4. **Middleware**: Added new middlewares for OpenRouter image generation, Qwen thinking, and tool choice control
5. **Provider Support**: Enhanced support for multiple LLM providers

## Known Issues & Required Follow-up Work

### Missing Modules (Electron → React Native)

The following modules referenced in the ported code do not yet exist in the React Native app and will need React Native equivalents:

#### Services

- `@/services/KnowledgeService` - Knowledge base search functionality
- `@/services/SpanManagerService` - Tracing/telemetry span management
- `@/services/FileManager` - File upload/management
- `@/services/MemoryProcessor` - Memory processing service
- `@/services/WebTraceService` - Web tracing service

#### Hooks

- `@/hooks/useAwsBedrock` - AWS Bedrock configuration hook
- `@/hooks/useVertexAI` - Google Vertex AI configuration hook
- `@/hooks/useLMStudio` - LM Studio configuration hook
- `@/hooks/useSettings` (`getEnableDeveloperMode`) - Settings hooks

#### Types

- `@/types/provider-specific-error` - Provider-specific error types
- `@/types/newMessage` - New message type definitions
- `@/types/aiCoreTypes` - AI Core type definitions
- `@/trace/types/ModelSpanEntity` - Tracing entity types
- Various exported types from `@/types` that are currently internal

#### Utilities

- `@/utils/mcp-tools` - MCP tools utilities
- `@/utils/aws-bedrock-utils` - AWS Bedrock utilities
- `@/utils/assistant` - Assistant utilities
- `@/utils/userConfirmation` - User confirmation dialogs
- `@/utils/linkConverter` - Link conversion utilities
- `@/config/constant` - Configuration constants
- `@/config/translate` - Translation configuration
- `@/config/providers` (`isNewApiProvider`) - Provider configuration

#### External Packages

- `@cherrystudio/openai` - Custom OpenAI package
- `@cherrystudio/openai/uploads` - File upload support
- `@anthropic-ai/vertex-sdk` - Anthropic Vertex SDK
- `@ai-sdk/google-vertex/edge` - Google Vertex edge SDK
- `@ai-sdk/google-vertex/anthropic/edge` - Anthropic on Vertex
- `@ai-sdk/huggingface` - HuggingFace SDK
- `@ai-sdk/mistral` - Mistral SDK
- `@ai-sdk/perplexity` - Perplexity SDK
- `@opeoginni/github-copilot-openai-compatible` - GitHub Copilot provider
- `@cherrystudio/ai-core/core/providers/schemas` - AI Core schemas

#### Other

- `@/aiCore/provider/constants` - Provider constants
- `@/store/memory` - Memory store
- `window.api.*` - Electron IPC calls (many references need removal/adaptation)
- `window.keyv.*` - Key-value storage calls (needs MMKV adaptation)

### Type Export Issues

Many types are declared locally in `@/types` but not exported. The following exports need to be added to make the code compile:

```typescript
// In src/types/index.ts or appropriate files:
export type {
  AISDKWebSearchResult,
  Assistant,
  BaseTool,
  EFFORT_RATIO,
  EndpointType,
  FileMetadata,
  FileTypes,
  FileUploadResponse,
  GenerateImageParams,
  KnowledgeReference,
  MCPCallToolResponse,
  MCPTool,
  MCPToolResponse,
  MCPToolResultContent,
  MemoryItem,
  Model,
  NormalToolResponse,
  OpenAIVerbosity,
  Provider,
  ProviderType,
  ResolutionType,
  ToolCallResponse,
  WebSearchResults,
  WebSearchSource
}
```

### Architectural Differences

1. **Electron vs React Native**: The upstream code is designed for Electron (Node.js environment) while the target is React Native. Many Node.js-specific features need alternative implementations.

2. **Window API**: Multiple references to `window.api` and `window.keyv` exist, which are Electron IPC mechanisms. These need React Native bridge equivalents.

3. **File System**: File operations assume Node.js `fs` module. Need to use `expo-file-system` instead.

4. **Store Architecture**: The Electron app may use different state management patterns than the React Native app.

## Verification Status

- ✅ All upstream files copied and transformed
- ✅ Import paths transformed to React Native conventions
- ✅ Code formatted with Prettier
- ❌ TypeScript compilation (expected - missing modules)
- ❌ ESLint (expected - missing modules)
- ❌ Runtime testing (requires implementation of missing modules)

## Next Steps

1. **Implement Missing Services**: Create React Native equivalents for missing services
2. **Add Type Exports**: Export all required types from their respective files
3. **Remove Electron Dependencies**: Replace `window.api` and `window.keyv` calls with React Native equivalents
4. **Install Missing Packages**: Add required external packages or find alternatives
5. **Test Integration**: Run integration tests once dependencies are resolved
6. **Update State File**: Ensure `.github/port-bot-state` is maintained for future ports

## Files Changed

- Modified: 54 files
- Added: 16 files
- Total: 70 files in `src/aiCore/`

See commit `458eeef` for complete diff.
