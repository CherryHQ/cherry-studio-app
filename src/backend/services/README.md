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
- `oauth` separates the desktop-aligned session runtime from mobile authorization adapters;
  `webSearch` retains the desktop-aligned `WebSearchService`. See the OAuth
  [README](./oauth/README.md).
- `cherryin` owns the mobile-only `CherryInClient` for that provider's external account REST
  surface. Device permissions are adapted by `DevicePermissions`; avatar storage remains a set of
  domain functions.
- `file` owns the Expo managed-file storage adapter, the validated `fileContent` port over it, and
  file maintenance orchestration. File-entry and reference persistence remain in
  `src/backend/data/services`.
- `keepAlive` owns the reference-counted silent-audio `KeepAliveCoordinator` (no preference gate —
  each consumer decides when to acquire). `backgroundActivities` owns the feature-agnostic
  `BackgroundActivityManager` session driver and the presenter seam over iOS Live Activities.
  Domain meaning stays with the consumers: `backgroundReply` is chat's adapter (turn state
  machine, content derivation), and the painting job handler drives its own session. Widget
  layouts live in `src/frontend/features/<feature>/background`; their props contracts sit in
  `src/shared/backgroundActivities`, and bootstrap/runtime configures the host-scoped activity
  environment before lifecycle services initialize.
- `src/backend/data/services` remains reserved for entity persistence and data-specific
  transformations.
- `src/backend/ai` remains reserved for AI SDK, provider, MCP runtime, message, and tool behavior.
  The app-owned `ChatRuntime` lives there too, in `streamManager/`, because it mirrors desktop's
  `src/main/ai/streamManager` rather than anything under `src/main/services`.

Workflow module factories accept narrow dependency objects. Concrete graph assembly and app-owned
lifecycle remain in `src/bootstrap`; `PaintingsModule` atomically creates receipts and enqueues work
owned by the host-scoped `JobRuntime`.

Direct desktop counterparts keep their `Service` names and public methods. Mobile additions use
`Module`, `Runtime`, `Session`, `Client`, `Adapter`, or `Manager` according to ownership; do not add
parallel `Backend`, `Service`, and `Impl` wrappers for one capability.
