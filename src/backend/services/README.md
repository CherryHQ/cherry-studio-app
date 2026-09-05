# Backend Capabilities

This directory is the mobile counterpart of Cherry Desktop's `src/main/services`. It owns
backend-facing product workflows, platform capabilities, and third-party services that do not
belong to AI or entity persistence.

The correspondence is by responsibility, not by file. Desktop process boundaries place some
equivalent workflows in DataApi handlers, Main AI modules, or renderer owners. Mobile keeps those
rules here when they belong behind the in-process Data API or workflow seam. The directory name is
an alignment and ownership bucket; it does not require every mobile-owned type to use a `Service`
suffix.

## Ownership

- `models`, `paintings`, `mcp`, `providers`, `permissions`, and `profile` expose mobile workflow
  factories named `createXxxModule()`. Their modules retain only orchestration that earns a
  frontend workflow contract; resource CRUD remains in Data API handlers.
- `webSearch` retains the desktop-aligned `WebSearchService`. Device permissions are adapted by
  `DevicePermissions`; avatar storage remains a set of domain functions.
- `file` owns the Expo managed-file storage adapter, the validated `fileContent` port over it, and
  file maintenance orchestration. File-entry and reference persistence remain in
  `src/backend/data/services`.
- `jobs` owns durable job orchestration. `JobHandlerRegistry` is the composition assembly service:
  it imports domain handlers and their dependencies, then exposes one frozen registry to the
  feature-agnostic `JobRuntime`. The runtime itself depends only on the database, that registry,
  and the `KeepAliveSource` capability; it must not import paintings or background activity
  implementations directly.
- `keepAlive` owns the reference-counted silent-audio `KeepAliveCoordinator` (no preference gate —
  each consumer decides when to acquire). `backgroundActivity` owns the feature-agnostic
  `BackgroundActivityManager` session driver and the presenter seam over iOS Live Activities.
  Domain meaning stays with the consumers: `backgroundReply` is chat's adapter (turn state
  machine, content and icon derivation), and the painting job handler drives its own session.
  CherryUI owns the fixed platform layout and visual policy; feature modules only register that
  renderer with their typed activity name. Feature props contracts sit in
  `src/shared/backgroundActivity`, and bootstrap/runtime configures the host-scoped activity
  environment before lifecycle services initialize.
- `jobs`, `keepAlive`, and `backgroundActivity` stay in `backend/services`: they are backend
  workflow and platform capabilities. They do not belong in `backend/core`, whose lifecycle and
  resource primitives remain independent of persistence, Expo modules, and product domains.
- `src/backend/data/services` remains reserved for entity persistence and data-specific
  transformations.
- `src/backend/ai` remains reserved for the Pi Agent Host, non-conversation AI SDK generation,
  provider adaptation, and MCP connection behavior.
- `http` owns non-streaming HTTP(S) request/response infrastructure for external services. It
  exposes an app-owned `HttpClient` contract over one shared Axios transport. Each client carries
  an immutable route whose base URL, defaults, and interceptors are selected only for that client's
  requests. The module does not own device discovery, authentication protocols, retries, response
  schemas, or frontend cache state. Local entity access remains in Data API and `src/backend/data`;
  Pi, AI provider, MCP, and remote Agent streaming transports remain separate.

Workflow module factories accept narrow dependency objects. Bootstrap configures host-scoped
environment inputs, while the application service registry assembles lifecycle services.
`PaintingsModule` atomically creates receipts and enqueues work owned by the host-scoped
`JobRuntime`.

Direct desktop counterparts keep their `Service` names and public methods. Mobile additions use
`Module`, `Runtime`, `Session`, `Client`, `Adapter`, or `Manager` according to ownership; do not add
parallel `Backend`, `Service`, and `Impl` wrappers for one capability.
