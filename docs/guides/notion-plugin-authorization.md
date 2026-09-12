# Notion Plugin

The bundled Notion plugin connects directly to Notion's official remote MCP service. Users do not
need to create a developer integration or paste a personal access token.

## Connect

1. Open Plugins, choose Notion, then Connect with Notion.
2. Sign in on Notion's authorization page and select the intended workspace.
3. Return to Cherry and confirm the displayed workspace and user.
4. Use Notion in a conversation, for example to find project decisions or save a summary as a page.

Enterprise administrators may need to allow Cherry's MCP client. Access follows the user's existing
workspace permissions. AI search requires an eligible Notion AI plan, and advanced search filters
and data-source queries have additional plan or quota limits.

## Capabilities

The initial allowlist contains search, AI search, fetch, data-source query, comment reads, page
creation, page updates, and comment creation. A database record is a page: read its data-source
schema before creating a record or updating its properties. Unsupported or newly introduced remote
tools are not automatically enabled. Attachments, database-schema editing, page moves/deletion,
and Notion agent execution are outside this slice.

Search results and fetched pages retain their source links. The workflow guide asks the model to
read the current account's tool access before using plan-dependent operations. A displayed tool is
not a guarantee that every operation is included in the workspace's plan.

## Authorization And Recovery

Cherry dynamically registers a public OAuth client with Notion, using the native build's existing
`cherrystudio`, `cherrystudio-dev`, or `cherrystudio-preview` scheme and the
`/plugins/notion/callback` route. OAuth discovery and token exchange are confined to the official
`mcp.notion.com` host. The client registration is preserved in the existing secure credential store;
it is reused when reconnecting so it does not orphan prior grants.

Each browser attempt has its own state and S256 PKCE proof. Codes and pending user tokens remain
in memory until the user confirms the account and the shared read-only connection check succeeds.
The identity check uses `notion-fetch` with `id: self`; MCP credentials are not sent to the Notion
REST API. Both workspace and user IDs participate in identity comparison. Disconnect before changing
to another identity.

Access tokens renew using rotating refresh tokens. Rejected grants require reconnection; uncertain
rotation or storage failures stop further automatic renewal in that runtime rather than replaying
an exchange. Local disconnection removes Cherry's credential and tool bindings. Remote revocation
is not advertised: manage the grant in Notion's connection settings when needed.

## References

- [Notion MCP setup](https://www.notion.com/help/notion-mcp)
- [Custom MCP clients and OAuth](https://developers.notion.com/guides/mcp/build-mcp-client)
- [Supported tools and plan restrictions](https://developers.notion.com/guides/mcp/mcp-supported-tools)
- [Built-in plugin architecture](../../src/backend/services/builtInMcp/README.md)

## Validation Status

OAuth, credential, and identity regression tests accompany this change. They have not been run;
builds, typechecking, device acceptance, and live-account authorization require separate user
authorization. The public OAuth metadata request made during research returned HTTP 403 in the
research environment, so the implementation follows the official client documentation and does
not claim a successful live connection.
