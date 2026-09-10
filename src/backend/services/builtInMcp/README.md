# Built-In MCP Plugins

This module owns official cloud MCP connections and the connect/disconnect workflow for **Plugins**.
GitHub and Amap are the first providers. The broader roadmap is in the
[integration design](../../../../docs/references/agent/built-in-mcp-design.md).

- `createPluginsModule` coordinates upstream validation, atomic persistence, and runtime
  invalidation for connect/disconnect. Mutations serialize per plugin.
- Connection metadata is read through `GET /plugin-connections` on the Data API. Frontend queries
  and invalidation use that endpoint's query key; credentials never enter its response.
- `PluginAuthorizationService`, under the data layer, owns the independent authorization table and
  changes its MCP reference in the same SQLite transaction. It resolves the current database per call.
  Credentials are stored as entered, the same way provider API keys and remote MCP headers already
  live in the sandboxed database. They are read per request and never become frontend query data,
  tool arguments, or saved MCP connection headers.
- `createBuiltInMcpClient` uses the installed `@ai-sdk/mcp` Streamable HTTP client and `expo/fetch`.
  Cherry connects directly to GitHub's and Amap's hosted services; no self-hosted server, subprocess,
  local protocol implementation, business API wrapper, or extra dependency is needed.
- The connection module owns fixed official endpoints, a reviewed tool-name allowlist, request-time
  credential injection, cancellation, safe transport errors, and no-replay writes. GitHub uses a
  Bearer header; Amap's key enters only the outgoing request URL, never the SDK's endpoint config.
  Tool names, descriptions, input schemas and execution come from the official service. Credentials
  are checked with read-only `get_me` or Beijing `maps_weather` before being saved.

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

The first version supports one connection per bundled provider and only static personal tokens or
API keys. OAuth, refresh tokens, multiple accounts, and additional platforms remain future slices.
GitHub write requests are never replayed; an uncertain write outcome tells the caller to inspect
GitHub before retrying. All Amap coordinates use GCJ-02 longitude,latitude.

Official service references: [GitHub remote MCP](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md),
[Amap MCP setup](https://lbs.amap.com/api/mcp-server/gettingstarted) and
[Amap tool catalog](https://lbs.amap.com/api/mcp-server/summary).
