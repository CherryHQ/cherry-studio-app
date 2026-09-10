# Built-In MCP Plugins

This module owns official cloud MCP connections and the connect/disconnect workflow for **Plugins**.
GitHub, Amap and Feishu are implemented. Shipped behavior is documented in the
[integration reference](../../../../docs/references/agent/built-in-mcp-design.md); proposed designs
are in the [roadmap](../../../../docs/references/agent/built-in-mcp-roadmap.md).

- `pluginRegistry` is the single bundled registration point. Definitions own metadata, reviewed
  tools, read-only validation and an ordered `authMethods` collection. Each method owns its form
  fields and encoder or interactive runtime factory, plus request authorization. Workflows and
  screens dispatch by method capability without provider-name branches.
- `GET /plugin-catalog` returns detached metadata including the method list. The connection page
  defaults to the first method and offers the others. Manual forms use the method's field rules;
  `InteractiveConnect` renders declared stages, browser confirmation and optional existing-app entry.
  Locale files own all copy under `plugins.catalog.<id>` and `plugins.authorization`.
- `createPluginsModule` coordinates read-only validation, persistence and connection invalidation.
  Mutations serialize per plugin. Each interactive action identifies both plugin and method.
- `PluginAuthorizationManager` creates one runtime and observer per interactive method. Its owner,
  `McpRuntimeService`, stops observers and drains runtimes on host disposal.
- `createAuthorizationObserver` schedules polling and completion while a screen observes. It
  reports state, progress and outcomes and leaves retries after failures to explicit user actions.
  Screens subscribe only while focused and active and request a check after browser return.
- `PluginAuthorizationService` owns grants and MCP references in SQLite. Every credential is a
  versioned plaintext JSON object in one column. Reusable applications and pending attempts use
  `app_state` under a plugin/method key. Interactive completion commits the credential, connection
  and candidate removal together. `GET /plugin-connections` exposes metadata only; credentials
  never enter frontend query caches, tool arguments or saved MCP headers.
- `createBuiltInMcpClient` binds the selected method to one grant. `createOfficialMcpClient` uses
  `@ai-sdk/mcp` Streamable HTTP and `expo/fetch`, checks authorization before and after credential
  resolution, enforces fixed endpoints and admitted tools, rejects redirects and never replays
  writes. A rotating credential retains its grant ID; reconnecting replaces that ID.
- GitHub injects a Bearer token and `X-MCP-Tools`; Amap injects a key only into the outgoing URL.
  Their setup checks use `get_me` and Beijing `maps_weather`. Feishu injects `X-Lark-MCP-UAT` or
  `X-Lark-MCP-TAT` plus `X-Lark-MCP-Allowed-Tools`; its setup checks account/scope facts and
  `fetch-doc` discovery without a business write. Each method owns credential injection.
- `feishuAuthorization` owns the application-token exchange and per-client cache. `feishuOauth`
  implements personal-agent registration, device authorization and renewal through the existing
  HTTP service. `FeishuAuthorizationRuntime` serializes durable steps, requires every document
  scope and an issued refresh token, and retains application identity across disconnect.
- Callers share one credential renewal, including its failure. A caller cancels only its wait;
  disconnect, successful replacement and host disposal invalidate the renewal owner. Updates
  compare the grant ID and previous credential object. Failed persistence retains the issued
  result in backend memory for a save retry before another renewal; process death can lose it.
- `migrateFeishuAuthorization` is a one-way upgrade from combined or split SecureStore data.
  SQLite becomes authoritative in one transaction before legacy keys are removed. New credentials
  never use SecureStore, and old keys cannot revive a replaced or deleted grant.

A grant change cannot retarget a tool from an already frozen turn catalog. Disconnect disables
existing Agent bindings and removes the server/grant while keeping reusable application information.

Every plugin tool keeps `source: 'mcp'`. Agent binding, disabled tools, approval, deferred discovery,
transcript results, and runtime result limits remain owned by the existing agent/MCP pipeline.
Connecting a plugin does not grant all Agents access. Upstream credentials never grant tool approval.
Executable catalog descriptions include the saved server name and builtin id so deferred discovery
can find tools by platform names such as `GitHub`, `github`, `高德地图`, and `amap`.
New upstream tools are not automatically admitted: discovery and invocation both enforce the
allowlist. The existing runtime validates discovered input schemas and applies result-size limits.

Migration `0022_official-cloud-plugins` disables existing GitHub/Amap Agent bindings for review,
preserving credentials, server IDs, approval settings and history. Migration
`0024_extensible-plugin-authorizations` removes the former provider enumeration and converts
historical credentials to JSON objects in the same migration, retaining all existing grants, MCP
identities and Agent settings. `pluginId` and `authMethod` are open durable strings. Keep IDs stable
and version objects inside each method.

The current version supports one connection per bundled provider. Feishu's six tools support
reading/browsing, creating, updating and commenting on documents. User-only document search,
Base, calendars, multiple accounts and other providers' OAuth remain future slices. Write requests
are never replayed; an uncertain write outcome tells the caller to inspect the service before
retrying. All Amap coordinates use GCJ-02 longitude,latitude.

Only bundled registrations can execute. Unknown plugin records remain visible and disconnectable;
unknown auth methods require reconnecting before requests can be sent. The registry is not a
runtime installer and does not load downloaded executable code.

Official service references: [GitHub remote MCP](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md),
[Amap MCP setup](https://lbs.amap.com/api/mcp-server/gettingstarted) and
[Amap tool catalog](https://lbs.amap.com/api/mcp-server/summary),
[Feishu developer MCP](https://open.feishu.cn/document/mcp_open_tools/developers-call-remote-mcp-server).

The authorization-method and SQLite regression suites were updated but were not run in this session.
No compilation, build, simulator, device or live-account acceptance was performed.
