# Domain Language

This reference defines the shared product and architecture language for Cherry Studio Mobile. The
mobile app keeps Cherry's chat and provider model compatible with Desktop while using mobile-native
data, navigation, rendering, and resource ownership patterns.

## Language

### Agent Conversation

**Cherry Mobile**:
The mobile Cherry Studio client built on Expo and React Native.
_Avoid_: mobile clone

**Agent**:
A reusable Cherry configuration that defines its name, prompt, selected model, and inference
settings.
_Avoid_: Assistant entity, bot, character

**Agent Session**:
A linear conversation owned by one Agent configuration.
_Avoid_: Topic, room

**Session Fork**:
A new Agent Session created by copying an existing transcript up to and including a chosen Message.
The fork records only the Session it came from, and the source is never modified.
_Avoid_: branch, clone, duplicate

**Message**:
A persisted Agent Session transcript item with a protocol id, role, status, and structured content
parts.
_Avoid_: row, text item

**Message Part**:
A typed unit of message content, such as text, reasoning, tool output, source, file, translation, video, code, compacted content, or error.
_Avoid_: flat message text, legacy block

**Transcript History Window**:
The database-backed, linear Agent Session window. It owns cursor pagination, older-message prefetch,
reveal policy, and persisted Messages handed to the chat list.
_Avoid_: active branch, stream state, live message buffer

**Streaming Message Overlay**:
The in-memory active assistant Message layer composed on top of transcript history while the Agent
Runtime is generating for a Session.
_Avoid_: persisted history page, query page

**Mobile Agent Host**:
The app-owned backend adapter between Agent Protocol and Pi Runtime. It owns per-Session turn state,
Runtime sessions, cancellation, snapshots, and terminal Message persistence.
_Avoid_: Chat Runtime, route state, screen state

**Agent Protocol**:
The frontend-visible workflow interface to the Mobile Agent Host. It observes Sessions, submits or
cancels turns, and exposes snapshots/events without transferring Host ownership to React.
_Avoid_: Chat Module, persistence API, route-owned runtime

### Backend And Data

**App Bootstrap Runtime**:
The mobile runtime owner that opens the local database, initializes cache, preferences, and seed
data, constructs the private Backend Service Graph, and composes the stable `ApiClient`,
`PreferenceClient`, and workflow `Backend` used by frontend providers.
_Avoid_: Data Runtime, desktop application service registry

**Backend Service Graph**:
The bootstrap-private in-process set of desktop-aligned services plus mobile runtimes, clients,
adapters, and workflow implementations behind the frontend-facing interfaces.
_Avoid_: Data Service Graph, HTTP API layer, repository bag

**Data API**:
The typed resource interface made of endpoint schemas, `ApiClient`, frontend query/mutation hooks,
in-process dispatch, and backend handlers. It shares Cherry Desktop's vocabulary but has no IPC or
HTTP transport on mobile.
_Avoid_: module selector, service bag, remote API

**Workflow Backend**:
The stable `Backend` aggregate of frontend-visible Workflow Modules that are not ordinary resource
endpoints, such as chat, painting generation, model reconciliation, and permission policy.
_Avoid_: persistence registry, Data API, resource service bag

**Workflow Module**:
A frontend-visible `XxxModule` contract that hides meaningful orchestration, lifecycle, platform,
or third-party complexity. Resource CRUD remains in the Data API.
_Avoid_: XxxBackend, pass-through service, persistence wrapper

**Painting Generation Job**:
A durable image-generation unit recorded in the job ledger. `JobRuntime` owns execution,
cancellation, and recovery independently of the initiating route; the painting receipt owns the
product result.
_Avoid_: Painting Generation Session, caller-owned generation

**Provider**:
A user-configurable AI service endpoint with API keys, auth configuration, endpoint configuration, and runtime API feature flags.
_Avoid_: vendor, host

**Model**:
A user-selectable model record owned by a Provider, with capabilities, endpoint types, pricing, context limits, and model metadata resolved for mobile runtime use.
_Avoid_: engine, deployment

**Unique Model Id**:
The stable mobile identifier that combines Provider id and provider model id.
_Avoid_: model name, display label

**Endpoint Config**:
A provider/model routing description that selects the endpoint type and AI SDK adapter family used for a request.
_Avoid_: URL string

**Preference**:
A local setting persisted in the mobile database under its own key and accessed through the separate
`PreferenceClient` and preference hooks.
_Avoid_: global variable, config constant

### AI And Search

**AI Provider Adapter**:
The mobile adapter that converts Provider and Model records into AI SDK provider settings, endpoint variants, headers, signing, and model ids.
_Avoid_: raw SDK client, provider service

**Pi Agent Engine**:
The sole local conversation engine. It owns model turns and tool-loop progression behind the Mobile
Agent Host, but it does not own Agent configuration, application persistence, permissions, or UI.
_Avoid_: AI SDK Runtime, Tool Service

**Provider-Native Web Search**:
Model-native web search enabled through AI provider options during an AI request.
_Avoid_: Web Search Provider

**Web Search Provider**:
An external search/fetch provider configured by web-search preferences and executed by WebSearchService.
_Avoid_: Provider-Native Web Search

**CherryAI Signature**:
The request signing data added to CherryAI chat completion requests.
_Avoid_: OAuth token, API key rotation

### Runtime And UI

**Runtime Owner**:
A runtime object with one explicit app, provider, hook, or caller owner that controls creation,
cleanup, abort, pause, or resume behavior when those behaviors apply.
_Avoid_: service registry, desktop lifecycle service

**Startup Gate**:
A named performance boundary that controls what can block first app paint.
_Avoid_: OS background phase

**Markdown Renderer**:
The message rendering boundary for Markdown-capable assistant Message Parts, regardless of whether the Message is currently streaming or already persisted.
_Avoid_: whole-message Markdown parser, network transport

**Interaction Button**:
A Cherry-owned pressable control or feature-local wrapper used for product buttons, icon buttons, and header actions.
_Avoid_: React Native Button as a product UI primitive

**Navigation Drawer**:
A side navigation container that can be opened from a header action or platform-appropriate product gesture.
_Avoid_: ad hoc side overlay

**System Gesture Zone**:
The screen-edge region reserved for operating-system gestures such as Android edge back.
_Avoid_: app-owned edge

**Product Horizontal Gesture**:
A Cherry-owned horizontal gesture for product UI such as drawers, swipe actions, carousels, or scrubbers.
_Avoid_: system back gesture
