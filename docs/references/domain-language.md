# Domain Language

This reference defines the shared product and architecture language for Cherry Studio Mobile. The
mobile app keeps Cherry's chat and provider model compatible with Desktop while using mobile-native
data, navigation, rendering, and resource ownership patterns.

## Language

### Chat

**Cherry Mobile**:
The mobile Cherry Studio client built on Expo and React Native.
_Avoid_: mobile clone, assistant clone

**Assistant**:
A reusable Cherry configuration that defines prompt and selected/default model behavior.
_Avoid_: bot, character

**Topic**:
A chat thread or conversation owned by an assistant context.
_Avoid_: chat table, room

**Message**:
A persisted chat item in a topic with role, status, model snapshot, metadata, and structured content parts.
_Avoid_: row, text item

**Message Part**:
A typed unit of message content, such as text, reasoning, tool output, source, file, translation, video, code, compacted content, or error.
_Avoid_: flat message text, legacy block

**Message History Window**:
The database-backed active-branch message window for a Topic. It owns history pagination, older-message prefetch, reveal policy, and the static persisted Messages handed to the chat list.
_Avoid_: stream state, live message buffer

**Streaming Message Overlay**:
The in-memory active assistant Message layer composed on top of the Message History Window while the Chat Runtime is generating for a Topic.
_Avoid_: persisted history page, query page

**Chat Runtime**:
The app-owned backend executor for active LLM streams across Topics. It owns per-Topic turn state,
AbortControllers, snapshots, tool approval, and terminal assistant Message persistence.
_Avoid_: Chat Session, route state, screen state

**Chat Module**:
The frontend-visible workflow interface to the Chat Runtime. It sends or aborts Topic turns and
exposes snapshots and events without transferring runtime ownership to React.
_Avoid_: Chat Service, Chat Backend, route-owned session

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

**Painting Generation Session**:
A caller-owned, isolated image-generation lifecycle. It owns cancellation, incomplete receipt retry
state, and disposal independently from other sessions.
_Avoid_: Painting Service, app runtime

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
A scoped local setting persisted in the mobile database and accessed through the separate
`PreferenceClient` and preference hooks.
_Avoid_: global variable, config constant

**Pin**:
A polymorphic marker that raises supported entities such as topics, providers, or models in product ordering.
_Avoid_: favorite

**Tag**:
A polymorphic label attached to supported entities through entity tagging.
_Avoid_: category, folder

**Prompt**:
A reusable prompt template persisted in the local data layer.
_Avoid_: message, assistant

### AI And Search

**AI Provider Adapter**:
The mobile adapter that converts Provider and Model records into AI SDK provider settings, endpoint variants, headers, signing, and model ids.
_Avoid_: raw SDK client, provider service

**Tool Resolver**:
The request-scoped backend capability that selects and combines active built-in, MCP, and external
web-search tools for one AI request.
_Avoid_: Tool Service, tool persistence registry

**Provider-Native Web Search**:
Model-native web search enabled through AI provider options during an AI request.
_Avoid_: Web Search Provider

**Web Search Provider**:
An external search/fetch provider configured by web-search preferences and executed by WebSearchService.
_Avoid_: Provider-Native Web Search

**CherryIN OAuth Session**:
The CherryIN authorization state that stores OAuth credentials and OAuth-derived API keys for the CherryIN Provider.
_Avoid_: CherryAI signature, manual API key

**CherryIN Client**:
The mobile external-account client for CherryIN profile and balance requests. Authentication stays
owned by the provider-aligned OAuth Runtime Service.
_Avoid_: CherryIN Service, OAuth runtime

**CherryAI Signature**:
The request signing data added to CherryAI chat completion requests.
_Avoid_: OAuth token, API key rotation

### Runtime And UI

**Runtime Owner**:
A runtime object with one explicit app, provider, hook, or caller owner that controls creation,
cleanup, abort, pause, or resume behavior when those behaviors apply.
_Avoid_: service registry, desktop lifecycle service

**Startup Gate**:
A named performance boundary that controls what can block first chat paint.
_Avoid_: lifecycle phase, OS background phase

**Chat Stream Transport**:
The runtime fetch capability used by AI SDK provider requests to receive streaming chat responses.
_Avoid_: provider parser, message renderer

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
