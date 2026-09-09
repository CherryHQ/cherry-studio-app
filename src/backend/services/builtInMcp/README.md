# Built-In MCP Plugins

This module owns official cloud MCP connections and the connect/disconnect workflow for **Plugins**.
GitHub, Amap and Feishu are implemented. The broader roadmap is in the
[integration design](../../../../docs/references/agent/built-in-mcp-design.md).

- `pluginRegistry` is the single bundled registration point. Each `plugins/` definition owns its
  localized catalog, credential fields/codec, auth-method identifier, client factory, reviewed tools
  and read-only validation. Storage and workflows contain no provider-name switches.
- `GET /plugin-catalog` returns detached JSON metadata from those definitions. The frontend derives
  its list, details and credential form from it; shared field rules also validate backend input.
- `createPluginsModule` coordinates upstream validation, atomic persistence, and runtime
  invalidation for connect/disconnect. Mutations serialize per plugin.
- Connection metadata is read through `GET /plugin-connections` on the Data API. Frontend queries
  and invalidation use that endpoint's query key; credentials never enter its response.
- `PluginAuthorizationService`, under the data layer, owns the independent authorization table and
  changes its MCP reference in the same SQLite transaction. It resolves the current database per call.
  Credentials are stored as entered, the same way provider API keys and remote MCP headers already
  live in the sandboxed database. They are read per request and never become frontend query data,
  tool arguments, or saved MCP connection headers.
- `createBuiltInMcpClient` resolves registered definitions and checks each grant against its plugin
  auth method. `createOfficialMcpClient` uses the installed `@ai-sdk/mcp` Streamable HTTP client and
  `expo/fetch` for the current three definitions.
  Cherry connects directly to official hosted services; no self-hosted server, subprocess,
  local protocol implementation, business API wrapper, or extra dependency is needed.
- Each plugin owns its fixed official endpoint, reviewed tool policy and credential injection. The
  shared HTTP helper owns cancellation, safe transport errors and no-replay writes. GitHub uses a
  Bearer header; Amap's key enters only the outgoing request URL, never the SDK's endpoint config.
  Tool names, descriptions, input schemas and execution come from the official service. GitHub/Amap
  credentials are checked with read-only `get_me` or Beijing `maps_weather` before being saved.
- `feishuAuthorization` exchanges the user's custom application ID/secret for a tenant access token
  through the shared HTTP client, with redirects rejected. Each MCP client owns its token cache;
  tokens are replaced before expiry and invalidated after HTTP 401. Every MCP request still checks
  its grant, including after token exchange. No failed business operation is replayed.
  Feishu receives `X-Lark-MCP-TAT` and `X-Lark-MCP-Allowed-Tools`. Initialization and `fetch-doc`
  discovery verify connection setup without reading a private document or invoking a write.

`McpRuntimeService` owns its private connection configuration and connection generations. A grant
change cannot retarget a tool from an already frozen turn catalog. Cloud requests resolve the
referenced grant again before each HTTP request. Disconnect removes that grant and disables the
server's existing Agent bindings.

Every plugin tool keeps `source: 'mcp'`. Agent binding, disabled tools, approval, deferred discovery,
transcript results, and runtime result limits remain owned by the existing agent/MCP pipeline.
Connecting a plugin does not grant all Agents access. Upstream credentials never grant tool approval.
Executable catalog descriptions include the saved server name and builtin id so deferred discovery
can find tools by platform names such as `GitHub`, `github`, `高德地图`, and `amap`.
New upstream tools are not automatically admitted: discovery and invocation both enforce the
allowlist. The existing runtime validates discovered input schemas and applies result-size limits.

Migration `0022_official-cloud-plugins` disables existing GitHub/Amap Agent bindings for review,
preserving credentials, server IDs, approval settings and history. Official names are not silently
substituted for old per-tool grants. After reviewing the cloud capabilities, users explicitly
re-enable the plugin and select any replacement tools. GitHub covers the previous workflows;
Amap covers eight of the previous nine categories, excluding standalone district lookup. Weather
is forecast-oriented, and upstream search inputs do not preserve Cherry's former pagination knobs.

The current version supports one connection per bundled provider: GitHub personal tokens, Amap
keys and Feishu application credentials. Feishu's six tools support reading/browsing, creating,
updating and commenting on documents shared with the application. User-only document search, Base,
calendars, OAuth user grants, refresh tokens and multiple accounts remain future slices.
Write requests are never replayed; an uncertain write outcome tells the caller to inspect the
service before retrying. All Amap coordinates use GCJ-02 longitude,latitude.

Official service references: [GitHub remote MCP](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md),
[Amap MCP setup](https://lbs.amap.com/api/mcp-server/gettingstarted) and
[Amap tool catalog](https://lbs.amap.com/api/mcp-server/summary),
[Feishu developer MCP](https://open.feishu.cn/document/mcp_open_tools/developers-call-remote-mcp-server).
See [expansion research](../../../../docs/references/agent/plugin-expansion-research.md) for Feishu
CLI-to-JavaScript boundaries and Canva/Gmail access prerequisites.

`pluginId` and `authMethod` are open durable strings. Migration
`0024_extensible-plugin-authorizations` removes the former provider enumeration once, while
retaining all existing grants, MCP identities and Agent settings. New credential-based plugins need
one definition and one registration; they do not need database or frontend provider-list changes.
Keep IDs and credential formats backward compatible; version future credential envelopes inside
the owning plugin. Interactive OAuth and multiple-account lifecycles remain future work.

Only bundled registrations can execute. Unknown plugin records remain visible and disconnectable;
unknown auth methods require reconnecting before requests can be sent. The registry is not a
runtime installer and does not load downloaded executable code.
