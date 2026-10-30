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
| System authorization prompts, including health record selection | `devicePermissions.request` in `src/backend/services/permissions`, which serializes every system prompt; a new native authorization becomes another method on `DevicePermissions` that holds that queue until the native operation settles |
| OAuth `state`, PKCE S256, native callback URL | `randomOauthValue`, `createPkceChallenge`, `nativeCallbackUrl` in `src/backend/utils/oauth.ts` |
| OAuth discovery, registration, code exchange, refresh | MCP SDK functions over `createFetchBridge`, as in `src/backend/services/mcp/McpOAuthRuntime.ts` |
| Google Cloud service-account signing and token exchange | `VertexAuthClient` in `src/backend/services/providers/vertex`, shared by model discovery and the pi-durable model resolver |
| Vertex service-account field validation | `VertexAuthFieldsSchema` in `src/shared/utils/vertexAuth.ts`, shared by provider settings and backend configuration checks |
| SHA-256 of bytes or text | `sha256Hex`, `sha256HexOfText` in `src/shared/utils/sha256.ts` |
| Model and request failure reasons | `classifyAiFailureReason` in `src/shared/utils/aiFailure.ts` |
| Inline bytes of MCP content blocks | `readMcpBinaryBlock` in `src/shared/contracts/mcpContent.ts` |
| Whether an Agent binding enables a whole MCP server | `enablesMcpServer` in `src/shared/utils/agentMcpBinding.ts` |
| Image media types and extensions | `src/shared/utils/imageFileTypes.ts` |
| Importing a file into managed storage, including one-time image normalization | `importManagedFile` in `src/backend/services/file/importManagedFile.ts`, used by `fileContent.createInternalEntry` and system share import |
| Reading and writing ZIP archives | `readZipDirectory`, `extractZipEntries` in `src/backend/utils/zipReader.ts`; `writeZipFile` in `src/backend/utils/zipWriter.ts` |
| Built-in tool display titles | `BUILT_IN_TOOL_TITLE_KEYS`, `getBuiltInToolTitleKey` in `src/shared/data/types/builtInToolTitles.ts`, read by the transcript and background activity |
| Image request deadline for an Agent turn | `withImageGenerationDeadline` in `src/backend/ai/agent/host/agentImageGeneration.ts` |
| Model purpose (text, image, embedding, rerank, audio) | `src/shared/utils/modelPurpose.ts` |
| Provider connection facts for language and image serving | `resolveProviderConnection` in `src/backend/ai/provider/providerConnection.ts` |
| Whether a Provider is ready to use, and why not | `getProviderConfigurationIssue` in `src/backend/services/providers/providerConfiguration.ts` |
| Whether a Provider may send requests without a key | `resolveAuthOptional` in `src/shared/utils/providerAuth.ts` |
| Provider API key selection and rotation | `ProviderService.resolveApiKey` and `getRotatedApiKey` in `src/backend/data/services/ProviderService.ts` |
| PDF text extraction and on-device PDF/image OCR | `modules/pdf-text-extractor`; `src/backend/services/file/fileTextExtraction.ts` shares extraction and derived disk results across `documentText.ts` and `imageText.ts` readers; `FileModule.observeFileOcr` reports one file's recognition progress |
| App language and its fallback | `APP_LANGUAGES`, `resolveAppLanguage` in `src/shared/utils/languages.ts` |
| Text translation | The translation module in `src/backend/services/translation` |
| Quoted answer text on a user message | `src/shared/contracts/agent/messageQuote.ts`; the model's blockquote in `formatMessageQuote`, `src/backend/ai/agent/host/turnRuntimeInput.ts` |
| Message translation source text | `messageTranslationText` in `src/shared/utils/messageTranslation.ts` |
| Editable assistant reply prose | `editableReplyParts` and `applyReplyEdits` in `src/shared/utils/assistantReply.ts`; every non-empty text part is editable, reasoning and tool receipts are not |
| Safe Markdown code fences | `createCodeBlockMarkdown` from `@cherrystudio/ui/markdown` |
| Markdown prose to plain text, code kept literal | `stripMarkdownFormatting` in `src/shared/utils/markdownFormatting.ts`, shared by search indexing and quote excerpts |
| Isolated JavaScript execution | `createJsSandbox` in `src/backend/services/jsSandbox` |
| Generating, inspecting and patching bounded DOCX/XLSX/PPTX files | `src/backend/services/office`; the Agent tools own source/image authorization, source hashes and file publication |
| Long-lived service lifecycle | `BaseService` in `src/backend/core/lifecycle/BaseService.ts` |
| Recoverable library file deletion, retention, and permanent removal | [File Trash](./data/trash.md), owned by `TrashRuntime` and `TrashService` |
| Durable background jobs | [Job Runtime](./job-runtime.md) |
| Logging | `loggerService` in `src/shared/core/logger` |
| Diagnostic event identity and versions | `src/backend/utils/diagnosticContext.ts`; bootstrap supplies an in-memory reader, logs and traces capture it before persistence |
| Diagnostic temporary files | `src/backend/utils/diagnosticTemporaryFiles.ts`; bundles and trace snapshots share a runtime-owned cache parent, startup reclaims previous runs |
| Bounded diagnostic identifiers | `diagnosticIdentifier` in `src/shared/utils/diagnosticIdentifier.ts`, shared by trace export and feedback context |
| Startup stage timing and milestones | `src/shared/core/logger/startupDiagnostics.ts`, exported through the diagnostic log allowlist |

Installed libraries cover these primitives: `@noble/hashes` (hashing in JavaScript), `expo-crypto`
(random bytes and native digests), `fflate` (ZIP and deflate), and `yaml`.

## Frontend

| Need | Owner |
| --- | --- |
| Product UI components | CherryUI in `packages/ui`; see [UI Components](./ui-components.md) |
| Ordering a small collection with up/down controls | CherryUI `ReorderList`; controlled items and caller-owned persistence/scrolling |
| Window size classes and the docked-sidebar rule | `useWindowClass` and `useCanDockSidebar` in `src/frontend/appShell/layout` |
| Where a foldable display divides a layout | `FoldRegionProvider`, `WindowFoldRegion`, and their hooks in `src/frontend/appShell/layout`, over `react-native-reserved-regions` |
| Header actions in the iOS native toolbar | `HeaderToolbarAction.nativeIcon` (an SF Symbol) and `renderHeaderToolbarItem` in `src/frontend/appShell/header` |
| Android back for a layer inside a route | `useFocusedBackPress` in `src/frontend/appShell/navigation`, held only while the route is focused |
| Pages rendered in a side pane, and the file pane beside chat | `PaneChromeProvider` in `src/frontend/appShell/layout`; `FilePaneProvider`, `FilePaneHost`, and `useFilePane` in `src/frontend/appShell/pane` |
| Mermaid diagrams in Markdown | `MermaidBlock`, `MermaidSvgView`, and the shared hidden renderer in `src/frontend/components/MermaidDiagram`; the offline page is `packages/mermaid-webview` |
| Readable message detail content and full-text copy | `MessageDetail` in `src/frontend/components/MessageDetail`, composing CherryUI `MessagePart.TextBody` and the full-source `CodeBlock` |
| Bounded plain-text reader blocks | `splitTextBlocks` from `@cherrystudio/ui/utils`, shared by message details and the file reader |
| Anchored informational text | `InfoPopover` from `@cherrystudio/ui/components` |
| Backend module access | `useBackendModule` in `src/frontend/data/BackendProvider.tsx` |
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
| Choosing the Agent that receives a file or reference handed over from outside chat | `AgentMenu` in `src/frontend/components/AgentMenu`, rendered by CherryUI `ActionMenu` |
| Composer attachment drafts from managed files | `createReadyAttachmentDraft` in `src/frontend/components/Composer/utils/composerAttachments.ts` |
| Adding resolved MCP text and binary content to a draft | `addMcpContentToDraft` in `src/frontend/components/McpContent` |
| Theme-aware MCP brand icon | `useMcpIcon` in `src/frontend/hooks/mcp/useMcpIcon.ts` |
| Applying what the user may change (organization-owned resources, profile capabilities) to UI: locked groups, locked controls and the organization mark | `PolicyScope`, `PolicyGroup`, `withPolicy` and the gates in `src/frontend/components/Policy`, over CherryUI `LockedGroup` and the components' `locked` variants |
