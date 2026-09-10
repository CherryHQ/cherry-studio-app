# Built-In MCP Plugins

This module owns official cloud MCP connections and the connect/disconnect workflow for **Plugins**.
GitHub, Amap and Feishu are implemented. Current behavior is documented in the
[integration reference](../../../../docs/references/agent/built-in-mcp-design.md); proposed designs
are in the [roadmap](../../../../docs/references/agent/built-in-mcp-roadmap.md).

## File Ownership

| Location | Owns |
| --- | --- |
| `index.ts` | Public entry point for bootstrap and the MCP runtime |
| `pluginDefinition.ts`, `pluginRegistry.ts` | Plugin registration, catalog projection and admitted tool policy |
| `createPluginsModule.ts` | Connect/disconnect workflow and per-plugin mutation ordering |
| `authorization/` | Method runtimes and observers, native credential storage, and their backend-only contracts |
| `transport/` | Grant-bound clients, fixed-endpoint HTTP and `validatePluginConnection` |
| `plugins/github.ts`, `plugins/amap.ts` | Small self-contained plugin definitions |
| `plugins/feishu/` | Feishu definition, browser authorization, user-token renewal, credential schemas and tests |

Keep provider-private code and tests beneath that provider. `authorization` and `transport` are
internal responsibility groups; they do not add public barrels. Feishu exposes only its definition
through `plugins/feishu/index.ts`.

The [connection page](../../../frontend/features/plugin/detail/connect/PluginConnectScreen.tsx)
selects between `CredentialConnect` and `InteractiveConnect`. `useInteractiveConnect` owns route
observation, browser actions and form state; backend observers own polling and completion.

## Workflow And Lifetime

- `pluginRegistry` is the single bundled registration point. Definitions own metadata, reviewed
  tools, read-only validation and an ordered `authMethods` collection. Each method owns its form
  fields and encoder or interactive runtime factory, plus request authorization. Workflows and
  screens dispatch by method capability without provider-name branches.
- `GET /plugin-catalog` returns detached metadata. The connection page defaults to the first listed
  method and offers the others. Manual forms use the method's field rules;
  `InteractiveConnect` renders declared stages, browser confirmation and optional existing-app entry.
  Locale files own all copy under `plugins.catalog.<id>` and `plugins.authorization`.
- `createPluginsModule` coordinates read-only validation, persistence and connection invalidation.
  Mutations serialize per plugin. Each interactive action identifies both plugin and method.
- `PluginAuthorizationManager` creates one runtime and observer per interactive method. Its owner,
  `McpRuntimeService`, stops observers and drains runtimes and native storage work on host disposal.
- `createAuthorizationObserver` schedules polling and completion while a screen observes. It
  reports state, progress and outcomes and leaves retries after failures to explicit user actions.
  Screens subscribe only while focused and active and request a check after browser return.
- `PluginCredentialStore` keeps reusable applications and completed grants in local SecureStore,
  without sync. SQLite owns connection metadata and opaque credential references. See the
  [storage contract](../../../../docs/references/agent/built-in-mcp-design.md#grants-and-connections).
- `PluginCredential` and resolved `PluginGrant` live in `authorization/pluginCredential.ts`.
  `PluginSecretReference` belongs to the database authorization schema. The database service accepts
  `credentialReference`; the native store accepts `credential`. The SQL column remains `credential`.
- `createBuiltInMcpClient` binds the selected method to one grant. `createOfficialMcpClient` uses
  `@ai-sdk/mcp` Streamable HTTP and `expo/fetch`, checks authorization before and after credential
  resolution, enforces fixed endpoints and admitted tools, rejects redirects and never replays
  writes. A rotating credential retains its grant ID; reconnecting replaces that ID.
- GitHub injects a Bearer token and `X-MCP-Tools`; Amap injects a key only into the outgoing URL.
  Their setup checks use `get_me` and Beijing `maps_weather`. Feishu injects `X-Lark-MCP-UAT`
  plus `X-Lark-MCP-Allowed-Tools`; its setup checks account/scope facts and
  `fetch-doc` discovery without a business write. Each method owns credential injection.
- `plugins/feishu/feishuCredentials` owns credential formats and field validation. `feishuOauth`
  implements personal-agent registration, device authorization and user-token renewal through the existing
  HTTP service. `FeishuAuthorizationRuntime` serializes authorization steps, requires every document
  scope and an issued refresh token, and retains application credentials across disconnect.
- Callers share one credential renewal, including its failure. A caller cancels only its wait;
  disconnect, successful replacement and host disposal invalidate the renewal owner. Saving replaces
  the complete native token bundle after checking the grant ID.
- Pending authorization stays in memory. Errors and process interruption require a new flow;
  reusable applications survive. No legacy imports, recovery journals or automatic cleanup retries.

The interactive contract currently represents browser confirmation with polling. Existing-application
entry and reset are optional method capabilities; callback and native SDK flows require their own
capability design when implemented.

A grant change cannot retarget a tool from an already frozen turn catalog. Disconnect disables
existing Agent bindings and revokes the server/grant before best-effort native cleanup.

Every plugin tool keeps `source: 'mcp'`. Agent binding, disabled tools, approval, deferred discovery,
transcript results, and runtime result limits remain owned by the existing agent/MCP pipeline.
Connecting a plugin does not grant all Agents access. Upstream credentials never grant tool approval.
Executable catalog descriptions include the saved server name and builtin id so deferred discovery
can find tools by platform names such as `GitHub`, `github`, `高德地图`, and `amap`.
New upstream tools are not automatically admitted: discovery and invocation both enforce the
allowlist. The existing runtime validates discovered input schemas and applies result-size limits.

Migration `0022_official-cloud-plugins` disables existing GitHub/Amap Agent bindings for review,
preserving credentials, server IDs, approval settings and history. Migration
`0024_extensible-plugin-authorizations` removes the former provider enumeration. `pluginId` and `authMethod` are open durable strings. Keep IDs stable
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

The authorization-method, SQLite and secure-storage regression suites were updated but not run.
No compilation, build, simulator, device or live-account acceptance was performed.
