# Slack plugin authorization

This plugin uses the official Slack Web API as the connected user. It supports message search,
channel/conversation listing, history, threads, permalinks and user lookup. It cannot send or modify
messages. User-owned internal applications can be created without publishing to Slack Marketplace;
workspace policies may require an administrator to approve installation and scopes.

## Create your own application

1. Open [Slack applications](https://api.slack.com/apps), select Create New App → From a manifest,
   choose your workspace, and paste [this manifest](../examples/slack/manifest.json).
2. Confirm **PKCE is enabled** in OAuth & Permissions. Slack treats this as a public client setting
   and enabling it is a one-way change without Slack support. Create a dedicated application rather
   than changing an existing server application. No client secret is entered in Cherry Studio.
3. Keep only the manifest's **User Token Scopes**: `search:read`, `channels:read`, `channels:history`,
   `groups:read`, `groups:history`, `im:read`, `im:history`, `mpim:read`, `mpim:history`, `users:read`.
   Custom native redirects do not support bot scopes. Do not add write scopes to this application.
4. Keep the callback for the Cherry variant you use:
   `cherrystudio://plugins/slack/callback`, `cherrystudio-dev://plugins/slack/callback`, or
   `cherrystudio-preview://plugins/slack/callback`. The sample permits all three official variants.
5. Copy the Client ID from Basic Information into Cherry Studio → Plugins → Slack. Sign in, select
   the workspace, approve access, and confirm the displayed workspace and user before connecting.

The application uses S256 PKCE, one-use callbacks, secure token storage and serialized token
rotation. Slack issues rotating user tokens for custom schemes even if the general token rotation
setting is disabled. Access tokens generally last 12 hours; PKCE refresh tokens expire after 30
 days. Cherry refreshes during use, not in a background daemon. After prolonged inactivity,
reconnect. Disconnect can revoke the token through Slack; app management is also available at
[Slack apps](https://slack.com/apps/manage).

## Visibility and limits

- A personal Slack account can create an application in a workspace where it has permission. This
  does not bypass owner policies, private channel membership, Slack Connect restrictions or retention.
- Free workspaces expose limited history (normally the last 90 days). Search availability remains
  subject to Slack's current plan and API policies.
- Slack applies lower `conversations.history` / `conversations.replies` limits to affected
  commercially distributed non-Marketplace apps: one request per minute and up to 15 items. Internal
  customer-built apps have different tiers. Cherry uses 15 items per history page and never retries
  a rate-limited request automatically. See the current method documentation for eligibility.
- This is a user-token integration. Bot tokens have different access rules and are not accepted.
  The official Slack MCP offering has its own app distribution/access requirements; this plugin
  directly calls Web API and does not depend on a shared MCP operator.
- Community implementations such as
  [slack-mcp-server](https://github.com/korotovsky/slack-mcp-server) demonstrate similar read use
  cases. Browser cookie extraction is not part of this plugin.

## Sources and acceptance

- [Official PKCE contract](https://docs.slack.dev/authentication/using-pkce/)
- [Token rotation](https://docs.slack.dev/authentication/using-token-rotation/)
- [OAuth token response](https://docs.slack.dev/reference/methods/oauth.v2.access/)
- [History limits](https://docs.slack.dev/reference/methods/conversations.history/)
- [Search](https://docs.slack.dev/reference/methods/search.messages/)

Live authorization, workspace policies, token rotation and both native callback variants still need
account/device acceptance before release. These were not executed during implementation.
