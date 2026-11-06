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
| IP country for provider discovery, recommendations and distribution | `RegionService` in `src/backend/services/region`; one lookup per cold start with a persisted-country fallback |
| Non-streaming HTTP requests | `createHttpClient` in `src/backend/services/http`, the only transport; its README lists the streaming exceptions |
| Verified remote file downloads | `downloadFile` in `src/backend/services/download`; native streaming, progress, cancellation and SHA-256 for APK updates and offline models |
| Fetch-shaped adapter for a protocol SDK | `createFetchBridge` in `src/backend/services/http` |
| Remote web-search provider protocols and metadata | `@cherrystudio/web-search`; mobile transport and policy adapters in `src/backend/services/webSearch` |
| Identifying outbound headers | `defaultAppHeaders` in `src/backend/utils/defaultAppHeaders.ts` |
| Combining abort signals | `linkAbortSignals` in `src/backend/utils/linkAbortSignals.ts` |
| Cancellable FIFO concurrency limit | `createConcurrencySlots` in `src/backend/utils/concurrencySlots.ts` |
| System authorization prompts, including health record selection | `devicePermissions.request` in `src/backend/services/permissions`, which serializes every system prompt; a new native authorization becomes another method on `DevicePermissions` that holds that queue until the native operation settles |
| OAuth `state`, PKCE S256, native callback URL | `randomOauthValue`, `createPkceChallenge`, `nativeCallbackUrl` in `src/backend/utils/oauth.ts` |
| OAuth discovery, registration, code exchange, refresh | MCP SDK functions over `createFetchBridge`, as in `src/backend/services/mcp/McpOAuthRuntime.ts` |
| Google Cloud service-account signing and token exchange | `VertexAuthClient` in `src/backend/services/providers/vertex`, shared by model discovery and the pi-durable model resolver |
| Vertex service-account field validation | `VertexAuthFieldsSchema` in `src/shared/utils/vertexAuth.ts`, shared by provider settings and backend configuration checks |
| SHA-256 of bytes or text | `sha256Hex`, `sha256HexOfText` in `src/shared/utils/sha256.ts` |
| Model and request failure reasons | `classifyAiFailureReason` in `src/shared/utils/aiFailure.ts` |
| Provider failure facts | `normalizeAiError` in `src/backend/ai/normalizeAiError.ts`; `piModelError.ts` adapts Pi terminal messages for turn projection and diagnostics |
| Inline bytes of MCP content blocks | `readMcpBinaryBlock` in `src/shared/contracts/mcpContent.ts` |
| Whether an Agent binding enables a whole MCP server | `enablesMcpServer` in `src/shared/utils/agentMcpBinding.ts` |
| Audio media-type classification, import-time type inference, and transcription source limits | `src/shared/utils/audioFileTypes.ts` |
| Image media types and extensions | `src/shared/utils/imageFileTypes.ts` |
| Importing a file into managed storage, including one-time image normalization | `importManagedFile` in `src/backend/services/file/importManagedFile.ts`, used by `fileContent.createInternalEntry` and system share import |
| Reading and writing ZIP archives | `readZipDirectory`, `extractZipEntries` in `src/backend/utils/zipReader.ts`; `writeZipFile` in `src/backend/utils/zipWriter.ts` |
| Built-in tool display titles | `BUILT_IN_TOOL_TITLE_KEYS`, `getBuiltInToolTitleKey` in `src/shared/data/types/builtInToolTitles.ts`, read by the transcript and background activity |
| Image request deadline for an Agent turn | `withImageGenerationDeadline` in `src/backend/ai/agent/host/agentImageGeneration.ts` |
| Recorded AI invocation speed | `getAiUsageRecordTokensPerSecond` in `src/shared/utils/aiUsage.ts`, shared by usage pagination and record presentation |
| Model purpose (text, image, embedding, rerank, audio) | `src/shared/utils/modelPurpose.ts` |
| Provider connection facts for language and image serving | `resolveProviderConnection` in `src/backend/ai/provider/providerConnection.ts` |
| Whether a Provider is ready to use, and why not | `getProviderConfigurationIssue` in `src/backend/services/providers/providerConfiguration.ts` |
| Whether a Provider may send requests without a key | `resolveAuthOptional` in `src/shared/utils/providerAuth.ts` |
| Provider API key selection and rotation | `ProviderService.resolveApiKey` and `getRotatedApiKey` in `src/backend/data/services/ProviderService.ts` |
| PDF text extraction and on-device PDF/image OCR | `modules/pdf-text-extractor`; `src/backend/services/file/fileTextExtraction.ts` shares extraction and derived disk results across `documentText.ts` and `imageText.ts` readers; `FileModule.observeFileOcr` reports one file's recognition progress |
| App language and its fallback | `APP_LANGUAGES`, `resolveAppLanguage` in `src/shared/utils/languages.ts` |
| Text translation | The translation module in `src/backend/services/translation` |
| Dictation, reading aloud, offline audio-file transcription, and voice engine choice | `Backend.voice`, implemented in `src/backend/services/voice`; see [Voice Input And Speech](./voice.md) |
| Joining dictated utterances without spaces in Chinese or Japanese | `appendUtterance` in `src/shared/utils/dictationText.ts` |
| Quoted answer snapshots and inline positions on a user message | `src/shared/contracts/agent/messageQuote.ts`; the model's blockquotes in `runtimeUserText` and `formatMessageQuote`, `src/backend/ai/agent/host/turnRuntimeInput.ts` |
| Message translation source text | `messageTranslationText` in `src/shared/utils/messageTranslation.ts` |
| Editable assistant reply prose | `editableReplyParts` and `applyReplyEdits` in `src/shared/utils/assistantReply.ts`; every non-empty text part is editable, reasoning and tool receipts are not |
| Safe Markdown code fences | `createCodeBlockMarkdown` from `@cherrystudio/ui/markdown` |
| Markdown prose to plain text, code kept literal | `stripMarkdownFormatting` in `src/shared/utils/markdownFormatting.ts`, shared by search indexing and quote excerpts |
| Status-only reasoning display data | `projectAgentMessageDisplay` in `src/shared/utils/agentMessageDisplay.ts`; list reasoning carries no text, while tool inputs, outputs and execution/recovery records remain complete |
| On-demand reasoning reads | `AgentProtocol.readReasoning`; the host reads the current Pi watch frame or saved transcript, isolating unrelated invalid saved parts with the existing display reader; expanded previews use `MessagePart.TextBody`, and tapping the viewport opens the message-owned full-text sheet |
| Private Agent working materials | Upstream `CodemodeStoreDoc` via Code Mode `store/load`; successful preparation calls precede execution/checking, never library files or backups |
| Isolated JavaScript execution | `createJsSandbox` in `src/backend/services/jsSandbox` |
| Generating, checking, inventorying and patching bounded DOCX/XLSX/PPTX files | `src/backend/services/office`; the Agent tools own source/image authorization, source hashes and file publication |
| Long-lived service lifecycle | `BaseService` in `src/backend/core/lifecycle/BaseService.ts` |
| Recoverable library file deletion, retention, and permanent removal | [File Trash](./data/trash.md), owned by `TrashRuntime` and `TrashService` |
| Durable background jobs | [Job Runtime](./job-runtime.md) |
| Logging | `loggerService` in `src/shared/core/logger` |
| Bounded diagnostic identifiers | `diagnosticIdentifier` in `src/shared/utils/diagnosticIdentifier.ts`, shared by trace export and feedback context |
| Startup stage timing and milestones | `src/shared/core/logger/startupDiagnostics.ts`, exported through the diagnostic log allowlist |

Installed libraries cover these primitives: `@noble/hashes` (hashing in JavaScript), `expo-crypto`
(random bytes and native digests), `fflate` (ZIP and deflate), and `yaml`.

## Frontend

| Need | Owner |
| --- | --- |
| Model selection and chat capability filtering | `ModelPickerDrawer` in `src/frontend/components/ModelPicker`; use its existing `chat` variant for the filter menu and capability badges |
| Provider selection | `ProviderPickerDrawer` in `src/frontend/components/ProviderPicker`; caller-owned candidates/search, matching model-picker sheet and row visuals |
| Product UI components | CherryUI in `packages/ui`; see [UI Components](./ui-components.md) |
| Controlled calendar range selection | CherryUI `DateRangePicker`; caller-owned drafts, presets and calendar-day boundaries |
| Ordering a small collection with up/down controls | CherryUI `ReorderList`; controlled items and caller-owned persistence/scrolling |
| Window size classes and the docked-sidebar rule | `useWindowClass` and `useCanDockSidebar` in `src/frontend/appShell/layout` |
| Where a foldable display divides a layout | `FoldRegionProvider`, `WindowFoldRegion`, and their hooks in `src/frontend/appShell/layout`, over `react-native-reserved-regions` |
| Header actions in the iOS native toolbar | `HeaderToolbarAction.nativeIcon` (a template image of the existing glyph) and `renderHeaderToolbarItem` in `src/frontend/appShell/header` |
| Android back for a layer inside a route | `useFocusedBackPress` in `src/frontend/appShell/navigation`, held only while the route is focused |
| Pages rendered in a side pane, and the file pane beside chat | `PaneChromeProvider` in `src/frontend/appShell/layout`; `FilePaneProvider`, `FilePaneHost`, and `useFilePane` in `src/frontend/appShell/pane` |
| Mermaid diagrams in Markdown | `MermaidBlock`, `MermaidSvgView`, and the shared hidden renderer in `src/frontend/components/MermaidDiagram`; the offline page is `packages/mermaid-webview` |
| Readable message detail content and full-text copy | `MessageDetail` in `src/frontend/components/MessageDetail`, composing CherryUI `MessagePart.TextBody` and the full-source `CodeBlock` |
| Message and individual-call usage details | `AiUsageDetail` in `src/frontend/components/AiUsageDetail`; callers own measurement/query semantics, and `src/frontend/utils/aiUsage` owns precise cost formatting |
| Bounded plain-text reader blocks | `splitTextBlocks` from `@cherrystudio/ui/utils`, shared by message details and the file reader |
| Anchored informational text | `InfoPopover` for a measured trigger, `AnchoredInfoPopover` for caller-measured text ranges, from `@cherrystudio/ui/components` |
| Backend module access | `useBackendModule` in `src/frontend/data/BackendProvider.tsx` |
| Live audio-file transcription progress by file or tool call | `useAudioTranscriptionActivity` from `src/frontend/hooks/file`, over the current `VoiceModule` activity |
| Preferences | `usePreference` in `src/frontend/data/hooks/usePreference.ts` |
| Persistent UI cache | `cacheService` in `src/frontend/data/CacheService.ts`, keys in `src/shared/data/cache/cacheSchemas.ts` |
| Feedback entry and context handoff | `useFeedbackActions`, `useFeedbackSource` and safe failure projection in `src/frontend/appShell/feedback`; settings owns the form |
| Target-language menus for text translation | `useTranslationLanguageMenu` in `src/frontend/hooks/useTranslationLanguageMenu.ts`, rendered by CherryUI `ActionMenu` |
| List selection state and controls | `src/frontend/components/Selection`, with `SelectionIndicator` from CherryUI and `common.selection.*` copy; management pages use `RouteHeader.selection` for the count and single exit |
| Opening external links | `openExternalUrl` in `src/frontend/utils/openExternalUrl.ts` |
| Compact counts | `formatCompactNumber` in `src/frontend/utils/compactNumber.ts` |
| Library folder browsing, creation, and selection for moves and Session workspaces | `FileFolderPicker` and `useCreateFileFolder` in `src/frontend/components/FileFolderPicker`; `FileFolderBreadcrumbs` owns the shared path navigation |
| Optional conversation workspace association, including unsent drafts | `useFileWorkspace` in `src/frontend/hooks/file`; chat owns `FileWorkspaceSheet`, reusing the shared file pages and `FileEntryPreview` viewer |
| Logical folder, file lineage, and workspace metadata | `FileLibraryService` and `fileLibraryRows` in `src/backend/data/services` |
| Choosing a new or existing conversation for an incoming share | `ConversationDestinationList` from `src/frontend/appShell/sidebar`, reusing the sidebar Agent groups; `systemEntry` owns the share handoff |
| Choosing the Agent that receives a file or reference handed over from outside chat | `AgentMenu` in `src/frontend/components/AgentMenu`, rendered by CherryUI `ActionMenu` |
| Composer attachment drafts from managed files | `createReadyAttachmentDraft` in `src/frontend/components/Composer/utils/composerAttachments.ts` |
| Adding resolved MCP text and binary content to a draft | `addMcpContentToDraft` in `src/frontend/components/McpContent` |
| Theme-aware MCP brand icon | `useMcpIcon` in `src/frontend/hooks/mcp/useMcpIcon.ts` |
