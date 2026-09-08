# Built-In MCP Plugins

This module owns bundled platform adapters and the connect/disconnect workflow for **Plugins**.
GitHub and Amap are the first providers. The broader roadmap is in the
[integration design](../../../../docs/references/agent/built-in-mcp-design.md).

- `createPluginsModule` exposes credential-free connection metadata and coordinates validation,
  encryption, atomic persistence, runtime invalidation, and key cleanup. Mutations serialize per
  plugin. Cancelling a connection before commit removes its staged encryption key.
- `PluginAuthorizationService`, under the data layer, owns the independent authorization table and
  changes its MCP reference in the same SQLite transaction. It resolves the current database per call.
- `credentialEncryption` uses Expo AES-GCM and device-only SecureStore keys. Ciphertext is bound to
  its provider and key identifier with authenticated additional data. Decrypted credentials are
  short-lived request inputs, never frontend query data, tool arguments, or connection headers.
- `BuiltInMcpTransport` implements the installed SDK's custom transport interface. The SDK remains
  the MCP client; there is no HTTP listener, subprocess, downloaded code, or parallel tool runtime.
- `providers/github` and `providers/amap` own fixed-authority HTTP routes, upstream request/response
  mapping, validation, safe errors, bounded result sizes, and their tool definitions. Shared Axios
  transport, cancellation, and query serialization stay in the existing `http` module.

`McpRuntimeService` owns connection generations. A grant change cannot retarget a tool from an
already frozen turn catalog. Provider calls resolve the referenced grant again before each HTTP
request. Disconnect removes that grant and disables the server's existing Agent bindings.

Every plugin tool keeps `source: 'mcp'`. Agent binding, disabled tools, approval, deferred discovery,
transcript results, and runtime result limits remain owned by the existing agent/MCP pipeline.
Connecting a plugin does not grant all Agents access. Upstream credentials never grant tool approval.

The first version supports one connection per bundled provider and only static personal tokens or
API keys. OAuth, refresh tokens, multiple accounts, and additional platforms remain future slices.
GitHub write requests are never replayed; an uncertain write outcome tells the caller to inspect
GitHub before retrying. All Amap coordinates use GCJ-02 longitude,latitude.

Provider API references: [GitHub REST](https://docs.github.com/en/rest),
[Amap Web Service](https://lbs.amap.com/api/webservice/summary).
