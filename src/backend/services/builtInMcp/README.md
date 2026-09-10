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
| `pluginGuide.ts` | Guide data types, authoring validation and the turn instruction snapshot contract |
| `createPluginsModule.ts` | Connect/disconnect workflow and per-plugin mutation ordering |
| `authorization/` | Method runtimes and observers, native credential storage, and their backend-only contracts |
| `transport/` | Grant-bound clients, fixed-endpoint HTTP and `validatePluginConnection` |
| `plugins/amap/` | Amap definition and workflow guide |
| `plugins/github/` | GitHub definition, workflow guide, OAuth App authorization with PKCE, account identity, token rotation and revocation |
| `plugins/feishu/` | Feishu definition, workflow guide, browser authorization, user-token renewal, credential schemas and tests |

Keep provider-private code and tests beneath that provider. `authorization` and `transport` are
internal responsibility groups; they do not add public barrels. Each plugin exposes only its
definition through `plugins/<id>/index.ts`.

The [connection page](../../../frontend/features/plugin/detail/connect/PluginConnectScreen.tsx)
selects between `CredentialConnect` and `InteractiveConnect`. `useInteractiveConnect` owns route
observation, browser actions and form state; backend observers own polling and completion.

## Plugin Guides

GitHub, Amap and Feishu each own a plain TypeScript guide module at `plugins/<id>/guide.ts` beside
their plugin definition. `PluginDefinition.guide` references its exported
data directly. Each guide contains a positive integer `revision` and ordered `sections`; each section
has a `content` string and a `requiredTools` array of raw MCP names. Template strings can retain
Markdown formatting for the existing preview renderer. For example:

```ts
export const feishuGuide = {
  revision: 1,
  sections: [
    { requiredTools: [], content: `Use this plugin for Feishu documents.` },
    {
      requiredTools: ['fetch-doc', 'update-doc'],
      content: `Read the current document before making a targeted update.`,
    },
  ],
} satisfies PluginGuideDefinition;
```

An empty `requiredTools` array supplies common context; other sections require **all** named tools on
the same connection. Registration validates the revision, 1–16 nonempty sections, admitted and unique
prerequisites, and an 8,192-byte UTF-8 limit for the combined trimmed text including section separators.
A missing guide is optional and does not disable tools; invalid guide data is rejected with the other
registration errors. A connection with no eligible sections contributes no guide.

Guides use the ordinary module pipeline without custom loaders, marker parsing, filesystem access or
network reads. Update `revision` with content changes for attribution; it has no cache-invalidation
role. This is bundled instruction data, not an importer or an executable Skill system.

The MCP descriptor carries the bundled plugin id from the stored server record. The Agent tool
resolver uses only descriptors admitted by the current Agent's bindings and effective tool policy to
select guides through the existing registry. Remote names and descriptions cannot identify a plugin.
Each connection produces at most one frozen guide snapshot with `pluginId`, `serverId`, `revision`
and selected text. Connections are ordered by plugin id and server id; sections retain authored order.
Tools from different connections cannot collectively satisfy a workflow's prerequisites.

The Host keeps these snapshots in `TurnPlan` beside the executable tools and includes them once in
the application prompt. Pi receives prepared text only. Guides do not change saved Agent instructions,
chat history, persisted inference metadata, permissions, approval or resource grants. Their text is
counted in the existing live context budget; it is not silently truncated. Runtime rules and the user's
request and Agent instructions take precedence over guide workflows. Raw names are discovery hints;
the model must still inspect each tool's current signature before calling its exact catalog alias.

Changes to bindings, disabled tools, connection availability or bundled revisions affect the next
prepared turn; existing execution-time revocation checks remain immediate. The plugin catalog also
projects a detached full guide preview by joining all sections. The detail page lazily renders that
read-only preview when expanded, using the shared Markdown renderer without native text selection.
Previewing a guide does not enable the plugin or any Agent tool.

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

Interactive methods declare `polling` or `callback`. Polling retains the Feishu rules above;
callback methods wait for a system authentication session and an exact redirect. A generic route
adapter removes callback parameters and forwards the original URL to the active method. GitHub
validates the redirect, state, deadline and PKCE proof and consumes each code once. Its `review`
state exposes the account identity and requires explicit confirmation before `ready` can
enter the shared read-only validation and commit sequence. Failed completion requires a new attempt.
Existing-application entry/reset remain optional; native SDK interactions remain future work.

The shared connection hook uses `openAuthSessionAsync` for GitHub's callback flow and
`openBrowserAsync` for Feishu's device flow. GitHub returns through the system authentication
session; Feishu checks the provider's authorization result by polling after browser confirmation.

GitHub's `github_user` method uses an OAuth App with `repo offline_access` and is available only
with the publisher configuration described in
[GitHub Plugin Authorization](../../../../docs/guides/github-plugin-authorization.md). It stores a
versioned completed object through the shared store; pending codes/verifiers/tokens remain in memory.
The user confirms the account before read-only MCP validation and commit; there are no GitHub App
installation queries or repository-count requirements. Stable numeric account IDs permit
same-account reconnection while preserving Agent bindings.
Changing identity or moving to/from an incomparable personal token requires explicit disconnection.
The shared commit checks the expected previous grant before saving.

`PluginAuthorizationManager.listConnections` adds local, credential-free status to the Data API;
reading the list does not renew tokens or contact a provider. Native-store changes and method status
changes notify connection queries. GitHub distinguishes missing/rejected credentials, uncertain
renewal/storage failures, and resource/network/quota errors. An ambiguous renewal result blocks
further automatic renewal in that runtime until reconnection; there is no durable recovery journal.
A method may capture an optional revocation closure before local disconnect. Local grants and
bindings are removed first, then remote revocation runs with a deadline; failure is reported without
undoing local disconnect. A late HTTP 401 is checked against the exact grant and sent token before
persisting rejection, and never triggers request replay.

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
