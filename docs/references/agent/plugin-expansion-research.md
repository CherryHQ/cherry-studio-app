# Plugin Expansion Research

> Reviewed 2026-09-10 against official documentation and source. Feishu uses personal-account
> cloud MCP through the extensible bundled plugin registry. Browser application setup, manual
> entry of an existing application, user device authorization and token renewal are implemented.
> See [Feishu Browser Authorization](./built-in-mcp-design.md#feishu-browser-authorization) for
> current behavior. Live-account/device acceptance remains pending. GitHub and Amap were already implemented.

## Selection

Keep the six integrations from [Built-In MCP Integrations](./built-in-mcp-design.md). Prioritize
officially hosted MCP services that a mobile app can call directly. An official open-source server
that needs a local process is a different delivery route.

| Region | Integration | Official offering | Decision |
| --- | --- | --- | --- |
| International | GitHub | Hosted MCP at `https://api.githubcopilot.com/mcp/`, personal-token support | Keep the current connector. [Official remote server](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md) |
| International | Canva | Hosted MCP at `https://mcp.canva.com/mcp`; individual OAuth authorization | Next cloud candidate after Cherry's callback is approved. Canva currently requires redirect-URI allowlisting; CIMD is preferred, DCR remains a deprecated compatibility option. Cherry has no configured approved callback. [Official integration guide](https://www.canva.dev/docs/mcp/) |
| International | Gmail | Hosted MCP at `https://gmailmcp.googleapis.com/mcp/v1`, Google Workspace Developer Preview | Update the former direct-API-only plan. Requires preview access, enabled Gmail/MCP APIs, OAuth configuration and a mobile authorization implementation. [Official setup](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server) |
| China | Amap | Hosted MCP at `https://mcp.amap.com/mcp`, Web Service key | Keep the current connector. [Official setup](https://lbs.amap.com/api/mcp-server/gettingstarted) |
| China | Feishu | Developer MCP at `https://mcp.feishu.cn/mcp`; user-token support | Use personal-account authorization with browser application setup or manually entered application credentials. [Official developer guide](https://open.feishu.cn/document/mcp_open_tools/developers-call-remote-mcp-server) |
| China | Yuque | Official TypeScript MCP server, distributed as `yuque-mcp`, using stdio | No official hosted endpoint was found in the reviewed repository. Assess a curated in-app OpenAPI adapter later; do not package its Node process into mobile. [Official repository](https://github.com/yuque/yuque-mcp-server) |

The reviewed Gmail catalog exposes search/read, drafts and label tools. It does **not** list a
send-mail tool: the earlier send-draft requirement needs a separately authorized Gmail API slice,
not an invented remote MCP tool. [Gmail tool catalog](https://developers.google.com/workspace/gmail/api/reference/mcp)

Canva's remote catalog covers discovery, generation and export. A custom client must meet its
authorization prerequisites before the app presents a working Connect action. Do not reuse another
product's client identity or callback. [Canva tools](https://www.canva.dev/docs/mcp/tools/)

## Feishu Delivery

The deprecated personal MCP URL path is unsuitable for new integration: Feishu announces that
MCP Token personal hosting will be phased out, and newly created links have seven-day validity.
The developer endpoint is a separate supported route with user-token authentication.
[Personal service notice](https://open.feishu.cn/document/mcp_open_tools/end-user-call-remote-mcp-server)

The connector admits six official document tools: `fetch-doc`, `list-docs`,
`get-comments`, `create-doc`, `update-doc`, and `add-comments`. It discovers their schemas from the
service and passes `X-Lark-MCP-UAT` plus `X-Lark-MCP-Allowed-Tools`. Personal search is excluded.
Authorization requires every scope listed for the selected tools in the official guide. Connection
setup checks account identity, granted scopes and tool discovery; document access remains subject
to the user's permissions. [Developer tools and permissions](https://open.feishu.cn/document/mcp_open_tools/developers-call-remote-mcp-server)

The user configures an application on Feishu's browser page or enters an existing application's
App ID and App Secret, then authorizes their personal account. Cherry stores the application and
user grant in local native secure storage and renews user tokens on demand. Concurrent callers
share renewal, while failed writes are never replayed. Application credentials identify the OAuth
client; they do not create a separate application-identity connection.

Implementation ownership:

- `PluginsModule` validates input, checks the upstream connection, commits the grant and invalidates
  the old runtime connection. Feishu credentials are encoded only in backend persistence.
- `PluginAuthorizationService` stores `feishu_user` grant references, while
  `PluginCredentialStore` owns native secret values without sync. Connection projections and MCP
  server rows expose no secrets.
- `createBuiltInMcpClient` resolves the registered definition and binds token use to its grant/method.
  `createOfficialMcpClient` rechecks that grant after credential resolution, rejects redirects and enforces
  tool admission on invocation as well as discovery.
- `plugins/feishu/feishuOauth` owns registration, device authorization and user-token renewal HTTP
  calls. `FeishuAuthorizationRuntime` serializes authorization and renewal through the shared
  authorization store. The HTTP transport rejects redirects. A failed write is never replayed.
- Existing Agent bindings, approval, cancellation and result-size limits remain authoritative.
  Connecting does not enable the plugin for every Agent.

Migration `0024_extensible-plugin-authorizations` removes the old provider/method enumerations.
The backend registry now owns availability and credential compatibility; its safe projection drives
the catalog and generic credential form. Adding a platform no longer changes SQL. Drizzle's generated parent
table replacement was reconciled to rebuild the referencing MCP table first, because foreign-key
disabling does not work inside the runtime migration transaction. It preserves grants, server IDs,
disabled tools and Agent bindings. Its journal timestamp is later than the preceding reconciliation
migration, whose timestamp was ahead of the local generation clock.

## Can The Feishu CLI Be Rewritten In JavaScript?

Yes, its useful workflows can be implemented as in-app TypeScript modules. The official CLI is a
Go program despite npm distribution; it is not an importable React Native library. Its MIT license
permits adaptation and redistribution with the copyright/license notice retained for copied or
adapted portions. This change implements the documented HTTP protocol independently and does not
vendor CLI source. API permissions and platform terms still apply.
[Official source](https://github.com/larksuite/cli),
[Go dependencies](https://github.com/larksuite/cli/blob/main/go.mod),
[MIT license](https://github.com/larksuite/cli/blob/main/LICENSE)

The JavaScript implementation covers personal-account authorization and the hosted document tools
described above. For broader CLI coverage, port command semantics in small slices:

| CLI responsibility | Mobile implementation | Status |
| --- | --- | --- |
| Cloud document calls | User-token injection through the existing MCP runtime | Implemented; live acceptance pending |
| Personal-agent application registration | Browser verification plus bounded, cancellable polling; keep issued credentials backend-owned; an existing application may be entered instead | Implemented; live acceptance pending |
| User authorization and renewal | Device authorization, expiry/scopes and refresh-token replacement in local native secure storage; SQLite references and account/grant isolation; no sync | Implemented; live acceptance pending |
| Curated Base, Calendar and Tasks shortcuts | Typed inputs and dedicated OpenAPI functions exposed through the existing tool approval pipeline | Planned |
| Pagination and structured command output | Bounded pages, cancellation and normalized results in the owning adapter | Planned |
| CLI skills | App-owned instruction resources with attribution, adapted to tool names available in the turn | Separate instruction-resource work |
| Shell, Cobra command parser, OS keychain/files, terminal prompts, installation and daemon/event loops | Do not bundle; replace only when a mobile use case requires a corresponding app capability | Outside the initial port |

The CLI source contains browser-based application registration and device-authorization flows,
so a JavaScript port does not inherently require a local listener or desktop process. Support for
Cherry's mobile browser lifecycle, tenant restrictions and personal-agent registration must still
be established before shipping that user-account flow. Do not infer mobile acceptance from Go code
alone. Reviewed source revision: `4fddd6bc3763f2105a2e31f0a992f19554aa350f`.
[Registration source](https://github.com/larksuite/cli/blob/4fddd6bc3763f2105a2e31f0a992f19554aa350f/internal/auth/app_registration.go),
[Device authorization source](https://github.com/larksuite/cli/blob/4fddd6bc3763f2105a2e31f0a992f19554aa350f/internal/auth/device_flow.go)

## Next Work And Evidence

1. User-owned acceptance of Feishu personal authorization against an authorized document and
   knowledge space, including application setup, user consent, token renewal, the six admitted
   operations and disconnect behavior.
2. Obtain Canva callback approval and Gmail preview/OAuth project configuration. Implement their
   user authorization flows before adding them as connectable catalog entries.
3. Port selected Feishu Base, Calendar and Tasks workflows. Their
   implementation should share authorization ownership with cloud document calls.
4. Assess Yuque's curated API slice using its official server as protocol/workflow evidence.

Regression cases cover open identifiers, synthetic plugin registration, shared field rules,
unknown-plugin refusal/disconnect, Feishu input/storage contracts, migration preservation under foreign
keys, grant revocation during credential resolution, user-token expiry/cancellation, redirect rejection,
write non-replay, existing-application authorization, native credential storage, caller-independent
renewal and observer-driven polling/completion. The updated suites have not been run after the
authorization and persistence changes. No current type-check, build, cloud acceptance or device
acceptance result is claimed.
