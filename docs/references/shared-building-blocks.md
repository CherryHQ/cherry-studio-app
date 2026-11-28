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
| Pure within-array reordering | `reorderLocally` in `src/shared/utils/reorder.ts`; the frontend `data/utils/reorder.ts` entry re-exports it alongside query-cache ordering helpers |
| Installed-package updates | `appUpdate` in `src/backend/services/appUpdate`; app-shell `appUpdate` owns the update dialog, cold-start offer and entry state |
| Egress region for provider discovery, recommendations and distribution | `RegionService` in `src/backend/services/region`; Config Service `POST /v1/resolve` lookup independent of data-collection consent, ten-minute success cache and explicit unknown-region result |
| Provider discovery and first-install recommendation edition | `getProviderCatalogEdition` in `src/backend/services/providers/providerCatalogEdition.ts`; all distributions prefer detected egress region, then device region, retaining the domestic default only when both are unavailable |
| Non-streaming HTTP requests | `createHttpClient` in `src/backend/services/http`, the only transport; its README lists the streaming exceptions |
| Remote file downloads | `downloadFile` in `src/backend/services/download`; bounded native transfer, progress and cancellation; mandatory SHA-256 for APK/models and explicit caller validation for private archives |
| Fetch-shaped adapter for a protocol SDK | `createFetchBridge` in `src/backend/services/http` |
| Remote web-search provider protocols and metadata | `@cherrystudio/web-search`; mobile transport and policy adapters in `src/backend/services/webSearch` |
| Identifying outbound headers | `defaultAppHeaders` in `src/backend/utils/defaultAppHeaders.ts` |
| Combining abort signals | `linkAbortSignals` in `src/backend/utils/linkAbortSignals.ts` |
| Cancelling a caller's wait without cancelling shared work | `raceAbort` in `src/backend/utils/raceAbort.ts` |
| Cancellable FIFO concurrency limit | `createConcurrencySlots` in `src/backend/utils/concurrencySlots.ts` |
| Cooperative event-loop yield in chunked loops | `yieldToRuntime` in `src/shared/utils/yieldToRuntime.ts` |
| System authorization prompts, including health record selection | `devicePermissions.request` in `src/backend/services/permissions`, which serializes every system prompt; a new native authorization becomes another method on `DevicePermissions` that holds that queue until the native operation settles |
| OAuth `state`, PKCE S256, native callback URL | `randomOauthValue`, `createPkceChallenge`, `nativeCallbackUrl` in `src/backend/utils/oauth.ts` |
| Community service metadata for the current login | Backend-only `AccountRuntime.refreshCommunityServices`, backed by `bootstrap/profile/installationAccount`; refreshes only the saved region's product routing without replacing authentication |
| OAuth discovery, registration, code exchange, refresh | MCP SDK functions over `createFetchBridge`, as in `src/backend/services/mcp/McpOAuthRuntime.ts` |
| Google Cloud service-account signing and token exchange | `VertexAuthClient` in `src/backend/services/providers/vertex`, shared by model discovery and the pi-durable model resolver |
| Vertex service-account field validation | `VertexAuthFieldsSchema` in `src/shared/utils/vertexAuth.ts`, shared by provider settings and backend configuration checks |
| SHA-256 of bytes or text | `sha256Hex`, `sha256HexOfText` in `src/shared/utils/sha256.ts`; `sha256HexChunks` incrementally hashes package bytes while yielding to the runtime |
| Model and request failure reasons | `classifyAiFailureReason` in `src/shared/utils/aiFailure.ts` |
| Provider failure facts | `normalizeAiError` in `src/backend/ai/normalizeAiError.ts`; `piModelError.ts` adapts Pi terminal messages for turn projection and diagnostics |
| Provider diagnostic metadata for traces and feedback | `src/shared/utils/providerDiagnostics.ts` projects bounded protocol fields, message roles and Cherry Cloud request IDs |
| Inline bytes of MCP content blocks | `readMcpBinaryBlock` in `src/shared/contracts/mcpContent.ts` |
| Whether an Agent binding enables a whole MCP server | `enablesMcpServer` in `src/shared/utils/agentMcpBinding.ts` |
| Audio media-type classification, import-time type inference, and transcription source limits | `src/shared/utils/audioFileTypes.ts` |
| Image media types, extensions and bounded-header identification | `src/shared/utils/imageFileTypes.ts` |
| Importing a file into managed storage, including one-time image normalization | `importManagedFile` in `src/backend/services/file/importManagedFile.ts`, used by `fileContent.createInternalEntry` and system share import |
| AI file implicit metadata | `src/backend/services/file` metadata capability for actual AI producers; shared fields in `shared/data/types/aiContent.ts`, Markdown/HTML carriers and reading projection in `shared/utils/aiContentText.ts`; programmatic sharing/rendering does not add declarations |
| Reading and writing ZIP archives | `readZipDirectory`, `extractZipEntries` in `src/backend/utils/zipReader.ts`; `writeZipFile` in `src/backend/utils/zipWriter.ts` |
| Built-in tool display titles | `BUILT_IN_TOOL_TITLE_KEYS`, `getBuiltInToolTitleKey` in `src/shared/data/types/builtInToolTitles.ts`, read by the transcript and background activity |
| Image request deadline for an Agent turn | `withImageGenerationDeadline` in `src/backend/ai/agent/host/agentImageGeneration.ts` |
| Recorded AI invocation speed | `getAiUsageRecordTokensPerSecond` in `src/shared/utils/aiUsage.ts`, shared by usage pagination and record presentation |
| Model purpose (text, image, embedding, rerank, audio) | `src/shared/utils/modelPurpose.ts` |
| Provider connection facts for language and image serving, and credential-free service addresses | `resolveProviderConnection` and `resolveProviderServiceUrl` in `src/backend/ai/provider/providerConnection.ts`; service URLs reuse the serving path's Vertex project/location resolver without materializing credentials |
| Development-only offline deterministic mock model provider (opt-in via `EXPO_PUBLIC_DEV_MOCK_PROVIDER=1`) | `isDevMockProviderEnabled` in `src/shared/utils/devMockProvider.ts`, `createDevMockFetch` in `src/backend/ai/provider/devMockProviderFetch.ts`, and `DevMockProviderSeeder` in `src/backend/data/db/seeding/seeders/DevMockProviderSeeder.ts` |
| Whether a Provider is ready to use, and why not | `getProviderConfigurationIssue` in `src/backend/services/providers/providerConfiguration.ts` |
| Whether a Provider may send requests without a key | `resolveAuthOptional` in `src/shared/utils/providerAuth.ts` |
| Provider API key selection and rotation | `ProviderService.resolveApiKey` and `getRotatedApiKey` in `src/backend/data/services/ProviderService.ts` |
| DeepSeek application service connections and finite requests | `src/backend/services/providers/deepseekConnection.ts` and `deepseekHttp.ts`; file/voice/search owners reuse the DeepSeek model Provider's current credentials and address; feature settings belong to their existing pages; see [DeepSeek Services](./deepseek-services.md) |
| PDF text extraction and on-device PDF/image OCR | `modules/pdf-text-extractor`; `src/backend/services/file/fileTextExtraction.ts` shares extraction and derived disk results across `documentText.ts` and `imageText.ts` readers; `FileModule.observeFileOcr` reports one file's recognition progress |
| App language and its fallback | `APP_LANGUAGES`, `resolveAppLanguage` in `src/shared/utils/languages.ts` |
| Remote Agent template catalogs and saved content | `useAgentTemplateCatalog` in `src/frontend/data/agentTemplates`; `Backend.agentTemplates` owns region routing, tolerant field reads and disk snapshots; [source policy](../../src/backend/services/agentTemplates/README.md) |
| Text translation | The translation module in `src/backend/services/translation` |
| Dictation, reading aloud, offline audio-file transcription, and voice engine choice | `Backend.voice`, implemented in `src/backend/services/voice`; see [Voice Input And Speech](./voice.md) |
| Task-owned iOS continued processing, finite execution and audio fallback | `DurableAgentHost` and `JobRuntime` own execution leases; `KeepAliveCoordinator` carries real progress to `IosBackgroundExecutionSource`, which stops shared protection when the final lease releases; SystemIntegration owns `ContinuedProcessing` and consented `BackgroundAudio`; voice declares speech/capture uses through its existing `audioSession` adapter |
| Joining dictated utterances without spaces in Chinese or Japanese | `appendUtterance` in `src/shared/utils/dictationText.ts` |
| Quoted answer snapshots and inline positions on a user message | `src/shared/contracts/agent/messageQuote.ts`; the model's blockquotes in `runtimeUserText` and `formatMessageQuote`, `src/backend/ai/agent/host/turnRuntimeInput.ts` |
| Message translation source text | `messageTranslationText` in `src/shared/utils/messageTranslation.ts` |
| Editable assistant reply prose | `editableReplyParts` and `applyReplyEdits` in `src/shared/utils/assistantReply.ts`; every non-empty text part is editable, reasoning and tool receipts are not |
| Safe Markdown code fences | `createCodeBlockMarkdown` from `@cherrystudio/ui/markdown` |
| Markdown prose to plain text, code kept literal | `stripMarkdownFormatting` in `src/shared/utils/markdownFormatting.ts`, shared by search indexing and quote excerpts |
| Markdown to readable speech | `speakableText` in `src/shared/utils/speechText.ts`, shared by chat and the voice runtime. It skips block code, images, web addresses and supported math delimiters while keeping link labels and inline code. |
| Status-only reasoning display data | `projectAgentMessageDisplay` in `src/shared/utils/agentMessageDisplay.ts`; list reasoning carries no text, while tool inputs, outputs and execution/recovery records remain complete |
| On-demand reasoning reads | `AgentProtocol.readReasoning`; the host reads the current Pi watch frame or saved transcript, isolating unrelated invalid saved parts with the existing display reader; expanded previews use `MessagePart.TextBody`, and tapping the viewport opens the message-owned full-text sheet |
| Private Agent working materials | Upstream `CodemodeStoreDoc` via Code Mode `store/load`; successful preparation calls precede execution/checking, never library files or backups |
| Managed-file and library reader media/pagination instructions | `buildFileReadInstructions` in `src/backend/ai/agent/tools/readFileTool.ts`; each deferred reader includes the complete rules for its parser and model image support |
| Isolated JavaScript execution | `createJsSandbox` in `src/backend/services/jsSandbox` |
| SSH commands, remote files, authentication and pooled native connections | `SshRuntime` in `src/backend/services/ssh` and `modules/ssh`; `sshFileStorage` owns bounded transfer staging and exact-byte library imports |
| Durable SSH connection configuration | `SshProfileService` in `src/backend/data/services`, with a dedicated MMKV store and a validated portable backup snapshot; credentials remain in SecureStore |
| Generating, checking, inventorying and patching bounded DOCX/XLSX/PPTX files | `src/backend/services/office`; the Agent tools own source/image authorization, source hashes and file publication |
| Community subscription, quota and Cloud inference admission | `CloudRuntime` in `src/backend/services/cloud`; `Backend.cloud` and `useCloud` expose non-secret account state |
| Cloud application HMAC signing | `modules/cloud-signing` owns the native credential; `cloudClientSignatureHeaders` in `src/backend/services/cloud` signs the validated inference request text |
| Long-lived service lifecycle | `BaseService` in `src/backend/core/lifecycle/BaseService.ts` |
| Desktop scheduled-task metadata, conversation membership and association caching | `RemoteTaskCatalog` in `src/backend/services/remoteAgent`, exposed through the existing Agent source's read-only `tasks` capability |
| Recoverable library file deletion, retention, and permanent removal | [File Trash](./data/trash.md), owned by `TrashRuntime` and `TrashService` |
| Durable background jobs | [Job Runtime](./job-runtime.md) |
| Logging | `loggerService` in `src/shared/core/logger` |
| Diagnostic event identity and versions | `src/backend/utils/diagnosticContext.ts`; bootstrap supplies an in-memory reader, logs and traces capture it before persistence |
| Diagnostic temporary files | `src/backend/utils/diagnosticTemporaryFiles.ts`; bundles and trace snapshots share a runtime-owned cache parent, startup reclaims previous runs |
| Transient application checks and AI self-check workflow | `Backend.diagnostics.createSession` in `src/backend/services/diagnostics`; owns incident binding, freshness, fact reads, cancellation, and the declared Agent deadline |
| Internal diagnostic Agent definition and execution | [Internal Diagnostic Agent](../../src/backend/ai/agent/diagnostics/README.md); `createDiagnosticAgent` binds runtime and usage delivery, while its JSON resource owns prompts, tool descriptions, and policy |
| Bounded diagnostic identifiers | `diagnosticIdentifier` in `src/shared/utils/diagnosticIdentifier.ts`, shared by trace export and feedback context |
| Startup stage timing and milestones | `src/shared/core/logger/startupDiagnostics.ts`, exported through the diagnostic log allowlist |

Installed libraries cover these primitives: `@noble/hashes` (hashing in JavaScript), `expo-crypto`
(random bytes and native digests), `fflate` (ZIP and deflate), and `yaml`.

## Frontend

| Need | Owner |
| --- | --- |
| Model selection and chat capability filtering | `ModelPickerDrawer` in `src/frontend/components/ModelPicker`; use its existing `chat` variant for the filter menu and capability badges |
| Cherry empty-state artwork | `EmptyIllustration` in `src/frontend/components/EmptyIllustration`. The caller confirms the empty state and passes the artwork to CherryUI `ContentState.Empty`. |
| Provider selection | `ProviderPickerDrawer` in `src/frontend/components/ProviderPicker`; caller-owned candidates/search, matching model-picker sheet and row visuals |
| Outgoing sharing, ordered previews and export lifetime | `src/frontend/appShell/sharing` and `src/frontend/features/sharing`; file delivery remains in `appShell/fileExport` |
| Local whole-conversation Markdown data export | `useExportConversation` in `appShell/sharing`, over `ConversationCatalog.readTranscript`; `frontend/utils/chatExportCitations` adapts saved parts to shared citation semantics in `frontend/utils/messageCitations` |
| Readable assistant answer body and confirmed citations | `selectAssistantBodyTextParts` from `Message/body` uses the renderer's generated-image de-duplication and body partition. `stripMessageCitations` in `frontend/utils/messageCitations` removes confirmed marks from the speech projection using the whole message's sources. |
| Small ordered preview stacks | CherryUI `CardStack`; caller-owned content, index and translated controls |
| Bounded local text reading | `readFileText` in `src/frontend/utils/readFileText.ts`, shared by file viewing and authored HTML conversion |
| Product UI components | CherryUI in `packages/ui`; see [UI Components](./ui-components.md) |
| Shared motion vocabulary | `@cherrystudio/ui/motion` in `packages/ui/src/motion.ts` (4-tier curves, springs, durations, `pressMotion`, `ambientMotion`) |
| Semantic haptic feedback | `@cherrystudio/ui/haptics` in `packages/ui/src/haptics.ts` (`triggerHaptic`, `haptics`, `HapticIntent`) |
| File/folder row presentation and path navigation | CherryUI `FileBrowserRow` and `Breadcrumbs`, shared by library folders and SSH files; callers own local or remote identities and file operations |
| Preserving reading position before expanding message content or switching answers | `useMessageListDisclosureToggle` from `src/frontend/components/Message` |
| Controlled calendar range selection | CherryUI `DateRangePicker`; caller-owned drafts, presets and calendar-day boundaries |
| Inline within-group drag reordering & long-press menu | CherryUI `Sortable` (`Sortable.Root`, `Sortable.Group`, `Sortable.Item`, `Sortable.Chrome`, `Sortable.Exclusion`); paired with `useReorder` (`src/frontend/data/hooks/useReorder.ts`) and `computeMinimalMoves` (`src/frontend/data/utils/reorder.ts`) for persistent collections |
| Window size classes and the docked-sidebar rule | `useWindowClass` and `useCanDockSidebar` in `src/frontend/appShell/layout` |
| Where a foldable display divides a layout | `FoldRegionProvider`, `WindowFoldRegion`, and their hooks in `src/frontend/appShell/layout`, over `react-native-reserved-regions` |
| Header actions in the iOS native toolbar | `HeaderToolbarAction.nativeIcon` (a template image of the existing glyph) and `renderHeaderToolbarItem` in `src/frontend/appShell/header` |
| Android back for a layer inside a route | `useFocusedBackPress` in `src/frontend/appShell/navigation`, held only while the route is focused |
| Inline pane headers/toolbars and Files Master-Detail layout | `PaneChromeProvider` in `src/frontend/appShell/layout`; `LibraryMasterDetailHost` and `useLibraryMasterDetail` in `src/frontend/appShell/pane` |
| Mermaid diagrams in Markdown | `MermaidBlock`, `MermaidSvgView`, and the shared hidden renderer in `src/frontend/components/MermaidDiagram`; the offline page is `packages/mermaid-webview` |
| Readable message detail content and full-text copy | `MessageDetail` in `src/frontend/components/MessageDetail`, composing CherryUI `MessagePart.TextBody` and the full-source `CodeBlock` |
| Message and individual-call usage details | `AiUsageDetail` in `src/frontend/components/AiUsageDetail`; callers own measurement/query semantics, and `src/frontend/utils/aiUsage` owns precise cost formatting |
| Bounded plain-text reader blocks | `splitTextBlocks` from `@cherrystudio/ui/utils`, shared by message details and the file reader |
| Anchored informational text | `InfoPopover` for a measured trigger, `AnchoredInfoPopover` for caller-measured text ranges, from `@cherrystudio/ui/components` |
| Backend module access | `useBackendModule` in `src/frontend/data/BackendProvider.tsx` |
| Live audio-file transcription progress by file or tool call | `useAudioTranscriptionActivity` from `src/frontend/hooks/file`, over the current `VoiceModule` activity |
| SSH authentication questions | App-shell `ssh/SshAuthenticationDialog`, observing the runtime queue through `useSshAuthentication`; answers bypass Agent and transcript state |
| Account sign-in fields, submission and failure feedback | `AccountSignInFields`, `useAccountSignInForm` and `useAccountErrorReporter` in `frontend/appShell/account`; entries own continuation and navigation |
| Account entry and callback continuation | `accountSignInHref` in `frontend/appShell/account`; the current profile's persistent UI cache retains its internal return target, and login/callback dismiss to it |
| Validating an internal return href | `readInternalHref` in `frontend/utils/internalHref.ts`; shared by account entry and provider setup, rejecting external URLs, fragments and path traversal |
| Desktop provider preview, selection and import | `frontend/hooks/useDesktopProviderSync`, over the existing desktop connection actions; entries own presentation, feedback and navigation |
| Preferences | `usePreference` in `src/frontend/data/hooks/usePreference.ts` |
| Device permission actions and status presentation | `frontend/hooks/devicePermission`, shared by settings and onboarding; preserves the settings request scopes and per-item action, while the backend permission owner serializes native prompts |
| Temporary local-file previews without library records | `src/frontend/appShell/filePreview`, handing cache leases to the existing files viewer through opaque navigation identities |
| Persistent UI cache | `cacheService` in `src/frontend/data/CacheService.ts`, keys in `src/shared/data/cache/cacheSchemas.ts` |
| Feedback entry and context handoff | `useFeedbackActions`, `useFeedbackSource` and safe failure projection in `src/frontend/appShell/feedback`; settings owns the form |
| Target-language menus for text translation | `useTranslationLanguageMenu` in `src/frontend/hooks/useTranslationLanguageMenu.ts`, rendered by CherryUI `ActionMenu` |
| List selection state and controls | `src/frontend/components/Selection`, with `SelectionIndicator` from CherryUI and `common.selection.*` copy; management pages use `RouteHeader.selection` for the count and single exit |
| Opening external links | `openExternalUrl` in `src/frontend/utils/openExternalUrl.ts` |
| Compact counts | `formatCompactNumber` in `src/frontend/utils/compactNumber.ts` |
| Library folder browsing, creation, and selection for moves and Session workspaces | `FileFolderPicker` and `useCreateFileFolder` in `src/frontend/components/FileFolderPicker`; `FileFolderBreadcrumbs` owns the shared path navigation |
| Optional conversation workspace association, including unsent drafts | `useFileWorkspace` in `src/frontend/hooks/file`; chat owns `FileWorkspaceSheet`, reusing the shared file pages and `FileEntryPreview` viewer |
| Logical folder, file lineage, and workspace metadata | `FileLibraryService` and `fileLibraryRows` in `src/backend/data/services` |
| Editing an Agent from management or the chat header | `AgentEditor` in `src/frontend/components/AgentEditor`; one auto-saving form with page and sheet presentations |
| Choosing a new or existing conversation for an incoming share | `ConversationDestinationList` from `src/frontend/appShell/sidebar`, reusing the sidebar Agent groups; `systemEntry` owns the share handoff |
| Choosing the Agent that receives a file or reference handed over from outside chat | `AgentMenu` in `src/frontend/components/AgentMenu`, rendered by CherryUI `ActionMenu` |
| Agent choice sheets for local chat, desktop chat and SSH handoff | `AgentPickerSheet` in `src/frontend/components/AgentPicker`; callers own source catalogs, candidate filtering and navigation |
| Composer attachment drafts from managed files | `createReadyAttachmentDraft` in `src/frontend/components/Composer/utils/composerAttachments.ts` |
| Adding resolved MCP text and binary content to a draft | `addMcpContentToDraft` in `src/frontend/components/McpContent` |
| Theme-aware MCP brand icon | `useMcpIcon` in `src/frontend/hooks/mcp/useMcpIcon.ts` |
| Applying what the user may change (organization-owned resources, profile capabilities) to UI: locked groups, locked controls and the organization mark | `PolicyScope`, `PolicyGroup`, `withPolicy` and the gates in `src/frontend/components/Policy`, over CherryUI `LockedGroup` and the components' `locked` variants |
| Frontend debounced actions, fixed-window flushes, and frame loops | `createDebouncedAction`, `createScheduledFlush`, and `createFrameLoop` in `src/frontend/utils/scheduling.ts` |
| Page-level debounced values, transient UI feedback, elapsed clocks, and next-frame scheduling | `useDebouncedValue`, `useTransientValue`, `useElapsedTime`, and `useNextFrame` / `useAfterNextFrame` in `src/frontend/hooks/`; ESLint forbids raw `setTimeout`, `setInterval`, `requestAnimationFrame`, and new raw `useEffect` in `src/app` and `src/frontend/features` (existing page `useEffect` files are ratcheted in `eslint.config.js`) |
