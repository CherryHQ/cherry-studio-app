# Shared Building Blocks

This reference indexes capabilities that already have one owner. Before writing a helper, parser,
transport adapter, store, or component for one of these needs, use the listed owner or extend it.
A second implementation needs a reason stated in its PR. When a capability gains a shared owner or
moves, update this index in the same change.

[Code Organization](./code-organization.md) decides where new code lives; this page answers whether
it already exists.

## Backend And Shared

| Need | Owner |
| --- | --- |
| Non-streaming HTTP requests | `createHttpClient` in `src/backend/services/http`, the only transport; its README lists the streaming exceptions |
| Fetch-shaped adapter for a protocol SDK | `createFetchBridge` in `src/backend/services/http` |
| Identifying outbound headers | `defaultAppHeaders` in `src/backend/utils/defaultAppHeaders.ts` |
| Combining abort signals | `linkAbortSignals` in `src/backend/utils/linkAbortSignals.ts` |
| Cancellable FIFO concurrency limit | `createConcurrencySlots` in `src/backend/utils/concurrencySlots.ts` |
| OAuth `state`, PKCE S256, native callback URL | `randomOauthValue`, `createPkceChallenge`, `nativeCallbackUrl` in `src/backend/utils/oauth.ts` |
| OAuth discovery, registration, code exchange, refresh | MCP SDK functions over `createFetchBridge`, as in `src/backend/services/mcp/McpOAuthRuntime.ts` |
| SHA-256 of bytes or text | `sha256Hex`, `sha256HexOfText` in `src/shared/utils/sha256.ts` |
| Model and request failure reasons | `classifyAiFailureReason` in `src/shared/utils/aiFailure.ts` |
| Inline bytes of MCP content blocks | `readMcpBinaryBlock` in `src/shared/contracts/mcpContent.ts` |
| Image media types and extensions | `src/shared/utils/imageFileTypes.ts` |
| Importing a file into managed storage, including one-time image normalization | `fileContent.createInternalEntry` in `src/backend/services/file/fileContent.ts` |
| App language and its fallback | `APP_LANGUAGES`, `resolveAppLanguage` in `src/shared/utils/languages.ts` |
| Text translation | The translation module in `src/backend/services/translation` |
| Isolated JavaScript execution | `createJsSandbox` in `src/backend/services/jsSandbox` |
| Long-lived service lifecycle | `BaseService` in `src/backend/core/lifecycle/BaseService.ts` |
| Durable background jobs | [Job Runtime](./job-runtime.md) |
| Logging | `loggerService` in `src/shared/core/logger` |

Installed libraries cover these primitives: `@noble/hashes` (hashing in JavaScript), `expo-crypto`
(random bytes and native digests), `fflate` (ZIP and deflate), and `yaml`.

## Frontend

| Need | Owner |
| --- | --- |
| Product UI components | CherryUI in `packages/ui`; see [UI Components](./ui-components.md) |
| Backend module access | `useBackendModule` in `src/frontend/data/BackendProvider.tsx` |
| Preferences | `usePreference` in `src/frontend/data/hooks/usePreference.ts` |
| Persistent UI cache | `cacheService` in `src/frontend/data/CacheService.ts`, keys in `src/shared/data/cache/cacheSchemas.ts` |
| List selection state and controls | `src/frontend/components/Selection`, with `SelectionIndicator` from CherryUI and `common.selection.*` copy |
| Opening external links | `openExternalUrl` in `src/frontend/utils/openExternalUrl.ts` |
| Compact counts | `formatCompactNumber` in `src/frontend/utils/compactNumber.ts` |
| Composer attachment drafts from managed files | `createReadyAttachmentDraft` in `src/frontend/components/Composer/utils/composerAttachments.ts` |
| Adding resolved MCP text and binary content to a draft | `addMcpContentToDraft` in `src/frontend/components/McpContent` |
