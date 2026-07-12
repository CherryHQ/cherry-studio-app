# Cherry Mobile Architecture Index

Status: current

This document is the architecture index for the Cherry Studio mobile app. Project language and domain boundaries are captured in [CONTEXT.md](../../CONTEXT.md), hard-to-reverse or easy-to-misread decisions are captured in [docs/adr](../adr), and concrete implementation guidance is split into the topic documents below.

## Scope

This document covers the current mobile app architecture: local data runtime, provider/model integration, chat runtime, streaming message overlay, navigation/insets, interaction components, and web search integration.

It does not define remote agent orchestration, Expo scaffolding, package installation, Expo Web support, or desktop Electron architecture.

## Topic Documents

- [Data Layer](./mobile-data-layer.md): SQLite/Drizzle runtime, bundled migrations, service graph, React Query hooks, and message tree persistence.
- [AI Provider Integration](./mobile-ai-provider-integration.md): Provider/Model records, endpoint resolution, AI SDK adapter variants, CherryAI signing, and CherryIN OAuth.
- [Web Search](./mobile-web-search.md): preference-backed external search providers and the distinction from provider-native web search.
- [Runtime Ownership](./mobile-runtime-ownership.md): Provider-owned runtime objects, startup gates, and current cleanup boundaries.
- [Navigation And Insets](./mobile-navigation-and-insets.md): Expo Router stacks, drawer, bottom sheets, Android back, edge-to-edge, and safe-area/inset strategy.
- [UI Components](./mobile-ui-components.md): current button/control wrappers and the boundary between shared wrappers and feature-local `Pressable` controls.
- [Chat Streaming And Rendering](./mobile-chat-streaming-rendering.md): AI SDK UI message streaming, Chat Runtime overlay, Message History Window, and current Markdown rendering.
- [Extension Points](./mobile-extension-points.md): where future feature domains (drawing/canvas, cloud agent) attach to the existing data, AI, and UI layers.

## Decision Index

- [ADR 0001: Use Provider-Owned Runtime Owners](../adr/0001-use-provider-owned-runtime-owners.md)
- [ADR 0002: Use Startup Gates Instead Of Lifecycle Phases](../adr/0002-use-startup-gates-not-lifecycle-phases.md)
- [ADR 0003: Use Pressable Wrappers For Product Buttons](../adr/0003-use-pressable-wrappers-for-product-buttons.md)
- [ADR 0004: Use Expo Runtime Fetch For Chat Streaming](../adr/0004-use-expo-runtime-fetch-for-chat-streaming.md)
- [ADR 0005: Preserve Message Part Rendering Boundaries](../adr/0005-preserve-message-part-rendering-boundaries.md)
- [ADR 0006: Use Platform-Native Navigation Gestures](../adr/0006-use-platform-native-navigation-gestures.md)
- [ADR 0007: Use Component Bottom Sheets For Model Picker](../adr/0007-use-component-bottom-sheets-for-model-picker.md)
- [ADR 0008: Defer op-sqlite Storage Migration](../adr/0008-defer-op-sqlite-storage-migration.md)
- [ADR 0009: Keep Flat src Layout](../adr/0009-keep-flat-src-layout.md)

## Current Baseline

- Runtime ownership uses Provider-owned runtime objects, not Cherry desktop's lifecycle framework or a `defineService` DSL. See [Runtime Ownership](./mobile-runtime-ownership.md).
- `DataProvider` owns local database initialization, preferences, bootstrapping, seeding, service graph creation, and cleanup. See [Data Layer](./mobile-data-layer.md).
- `InitialDataGate` blocks only until the data runtime is ready; current topic, message window, and chat runtime are loaded by route-level hooks/providers.
- Chat data preserves Cherry concepts: Assistant, Topic, Message, Message Part, Provider, Model, Preference, Pin, Tag, and Prompt.
- Provider, Model, Assistant, Tag, Pin, Prompt, Topic, and Message schemas remain desktop-aligned development schemas; desktop domain changes should be mirrored in mobile schema and service behavior, and local reset remains allowed during development.
- Chat uses `@legendapp/list` for the message list and a DB-backed Message History Window for active-branch pagination.
- Chat streaming uses AI SDK UI message chunks, a Provider-owned `ChatRuntime`, and an in-memory Streaming Message Overlay.
- Chat streaming relies on the Expo/React Native runtime fetch behavior; current device testing confirms incremental streaming works without a shared transport adapter.
- Active chat streaming is a foreground runtime behavior. App background does not promise background checkpointing, pause, recoverable resume, or terminal save of in-memory overlay deltas.
- Markdown-capable assistant parts use a unified `StreamdownText` path for both active streaming output and stable historical messages; user messages render as plain text.
- AI provider/model request architecture is implemented through mobile Provider/Model records, endpoint configs, adapter-family resolution, `AiService`, and the AI SDK Agent adapter.
- CherryIN OAuth follows desktop storage semantics: OAuth credentials live in provider `authConfig`; OAuth-derived gateway keys are normal provider `apiKeys` entries labeled `OAuth`.
- External web search is a preference-backed `WebSearchService` provider registry, separate from provider-native web search options; it is bridged into AI requests as the `web_search` tool and arbitrated mutually exclusive with provider-native web search per request. Zhipu's API-key bridge is a provider-specific exception.
- Navigation uses Expo Router stacks and drawer. Android predictive back remains disabled in `app.json` until real-device validation.
- Model picker uses a reusable component-level Expo UI `BottomSheet`, not a route-level `formSheet`.
- Settings uses route-level `formSheet` presentation.

## Runtime Dependencies

Cherry Mobile uses Expo development builds from the beginning and does not support Expo Go as a v1 runtime. Current runtime dependencies include:

- `expo-sqlite` with `drizzle-orm` for local persistence.
- `@tanstack/react-query` for service-backed query/mutation hooks.
- `@legendapp/list` for chat message virtualization.
- `react-native-streamdown`, `react-native-enriched-markdown`, `react-native-worklets`, and `remend` for Markdown rendering support.
- `heroui-native`, `@expo/ui`, and feature-local React Native `Pressable` wrappers for UI controls.
- `react-native-keyboard-controller` and `react-native-safe-area-context` for keyboard and inset handling.

The initial platform target is iOS and Android phones, with layout foundations for future iPadOS and Android tablets.

## Performance Acceptance Scenarios

Minimum scenarios:

- Cold start into the current chat surface.
- 100+ historical messages in a topic.
- One assistant response with 10k+ Markdown characters.
- Streaming response containing paragraphs, lists, code fences, tables, links, inline math, block math, and malformed math.
- Scrolling while a long assistant message is streaming.
- App background during active streaming stops without relying on background checkpoint or recoverable resume.
- In Android edge-to-edge mode, headers, chat input, message lists, and keyboard insets do not obscure each other.
- Android system edge back, nested stack back, drawer behavior, and modal/sheet back match platform expectations on real devices.
- Opening the component-level model picker from chat input does not leave keyboard or bottom inset state broken.
- Low-memory or low-end Android profiling pass before claiming performance is acceptable.

Success criteria:

- First chat paint does not wait for non-current history, full provider/model refresh, or diagnostics.
- Scrolling remains responsive during streaming.
- Keyboard/input remains responsive during streaming.
- Incomplete Markdown and LaTeX do not crash rendering.
- Active stream abort and Provider unmount clean the runtime's active AbortControllers and subscriptions.
- Android system back gestures are not stolen by product horizontal gestures.

## Pending Decisions

- Whether drawer swipe should remain full-width or be constrained to reduce Android system-edge gesture risk.
- Exact tablet layout behavior for iPadOS and Android tablets.
