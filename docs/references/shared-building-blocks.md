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
| Installed-package updates | `appUpdate` in `src/backend/services/appUpdate`; app-shell `appUpdate` owns the update dialog, cold-start offer and entry state |
| Non-streaming HTTP requests | `createHttpClient` in `src/backend/services/http`, the only transport; its README lists the streaming exceptions |
| Fetch-shaped adapter for a protocol SDK | `createFetchBridge` in `src/backend/services/http` |
| Remote web-search provider protocols and metadata | `@cherrystudio/web-search`; mobile transport and policy adapters in `src/backend/services/webSearch` |
| Identifying outbound headers | `defaultAppHeaders` in `src/backend/utils/defaultAppHeaders.ts` |
| Combining abort signals | `linkAbortSignals` in `src/backend/utils/linkAbortSignals.ts` |
| Cancellable FIFO concurrency limit | `createConcurrencySlots` in `src/backend/utils/concurrencySlots.ts` |
| System authorization prompts, including health record selection | `devicePermissions.runWithSystemPrompt` in `src/backend/services/permissions`; hold the queue until the native operation settles |
| OAuth `state`, PKCE S256, native callback URL | `randomOauthValue`, `createPkceChallenge`, `nativeCallbackUrl` in `src/backend/utils/oauth.ts` |
| OAuth discovery, registration, code exchange, refresh | MCP SDK functions over `createFetchBridge`, as in `src/backend/services/mcp/McpOAuthRuntime.ts` |
| SHA-256 of bytes or text | `sha256Hex`, `sha256HexOfText` in `src/shared/utils/sha256.ts` |
| Model and request failure reasons | `classifyAiFailureReason` in `src/shared/utils/aiFailure.ts` |
| Inline bytes of MCP content blocks | `readMcpBinaryBlock` in `src/shared/contracts/mcpContent.ts` |
| Whether an Agent binding enables a whole MCP server | `enablesMcpServer` in `src/shared/utils/agentMcpBinding.ts` |
| Image media types and extensions | `src/shared/utils/imageFileTypes.ts` |
| Importing a file into managed storage, including one-time image normalization | `fileContent.createInternalEntry` in `src/backend/services/file/fileContent.ts` |
| App language and its fallback | `APP_LANGUAGES`, `resolveAppLanguage` in `src/shared/utils/languages.ts` |
| Text translation | The translation module in `src/backend/services/translation` |
| Dictation, reading aloud, and voice engine choice | `Backend.voice`, implemented in `src/backend/services/voice`; see [Voice Input And Speech](./voice.md) |
| Audio file transcription for attachments and file tools | The `transcribeAudio` reader port, supplied by `createAudioAttachmentTranscriber` in `src/backend/services/voice` |
| Joining dictated utterances without spaces in Chinese or Japanese | `appendUtterance` in `src/shared/utils/dictationText.ts` |
| Message translation source text | `messageTranslationText` in `src/shared/utils/messageTranslation.ts` |
| Safe Markdown code fences | `createCodeBlockMarkdown` in `src/shared/utils/createCodeBlockMarkdown.ts` |
| Isolated JavaScript execution | `createJsSandbox` in `src/backend/services/jsSandbox` |
| Generating, inspecting and patching bounded DOCX/XLSX/PPTX files | `src/backend/services/office`; the Agent tools own source/image authorization, source hashes and file publication |
| Long-lived service lifecycle | `BaseService` in `src/backend/core/lifecycle/BaseService.ts` |
| Recoverable library file deletion, retention, and permanent removal | [File Trash](./data/trash.md), owned by `TrashRuntime` and `TrashService` |
| Durable background jobs | [Job Runtime](./job-runtime.md) |
| Logging | `loggerService` in `src/shared/core/logger` |
| Startup stage timing and milestones | `src/shared/core/logger/startupDiagnostics.ts`, exported through the diagnostic log allowlist |

Installed libraries cover these primitives: `@noble/hashes` (hashing in JavaScript), `expo-crypto`
(random bytes and native digests), `fflate` (ZIP and deflate), and `yaml`.

## Frontend

| Need | Owner |
| --- | --- |
| Product UI components | CherryUI in `packages/ui`; see [UI Components](./ui-components.md) |
| Anchored informational text | `InfoPopover` from `@cherrystudio/ui/components` |
| Backend module access | `useBackendModule` in `src/frontend/data/BackendProvider.tsx` |
| Preferences | `usePreference` in `src/frontend/data/hooks/usePreference.ts` |
| Persistent UI cache | `cacheService` in `src/frontend/data/CacheService.ts`, keys in `src/shared/data/cache/cacheSchemas.ts` |
| Target-language menus for text translation | `useTranslationLanguageMenu` in `src/frontend/hooks/useTranslationLanguageMenu.ts`, rendered by CherryUI `ActionMenu` |
| List selection state and controls | `src/frontend/components/Selection`, with `SelectionIndicator` from CherryUI and `common.selection.*` copy |
| Opening external links | `openExternalUrl` in `src/frontend/utils/openExternalUrl.ts` |
| Compact counts | `formatCompactNumber` in `src/frontend/utils/compactNumber.ts` |
| Library folder browsing, creation, and selection for moves and Session workspaces | `FileFolderPicker` and `useCreateFileFolder` in `src/frontend/components/FileFolderPicker`; `FileFolderBreadcrumbs` owns the shared path navigation |
| Optional conversation workspace association, including unsent drafts | `useFileWorkspace` in `src/frontend/hooks/file`; chat owns `FileWorkspaceSheet`, reusing the shared file pages and `FileEntryPreview` viewer |
| Logical folder, file lineage, and workspace metadata | `FileLibraryService` and `fileLibraryRows` in `src/backend/data/services` |
| Choosing the Agent that receives a file or reference handed over from outside chat | `AgentMenu` in `src/frontend/components/AgentMenu`, rendered by CherryUI `ActionMenu` |
| Composer attachment drafts from managed files | `createReadyAttachmentDraft` in `src/frontend/components/Composer/utils/composerAttachments.ts` |
| Adding resolved MCP text and binary content to a draft | `addMcpContentToDraft` in `src/frontend/components/McpContent` |
| Theme-aware MCP brand icon | `useMcpIcon` in `src/frontend/hooks/mcp/useMcpIcon.ts` |
