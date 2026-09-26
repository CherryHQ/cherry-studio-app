# Slack Plugin Setup

Cherry connects to Slack's official remote MCP service using a user token supplied by the user.
Create an internal Slack app in your own workspace, install it there, and paste its User OAuth Token
into Cherry. Publisher-managed OAuth and a Cherry Slack Marketplace listing are deferred.

## Create The Internal App

1. Open the Slack plugin's **Create a Slack app with preset permissions** link. It opens Slack's
   application creation page with the 29 user scopes in
   [slackSetup.ts](../../src/backend/services/builtInMcp/plugins/slack/slackSetup.ts) already filled in.
   Select your own workspace and create the app. No bot scopes, redirects or publisher credentials
   are included. Keep token rotation disabled for this manual-token connection.
2. In the app's **Agents** settings, enable **Slack Model Context Protocol (MCP) Server**, as described
   in Slack's [MCP setup guide](https://docs.slack.dev/ai/slack-mcp-server/developing/).
3. Open **OAuth & Permissions**, review **User Token Scopes**, and install the app to your workspace.
   Complete Slack's installation consent; your workspace may require administrator approval.
4. Copy the **User OAuth Token** beginning with `xoxp-` and paste it into Cherry. This is the user
   token, not the Bot User OAuth Token (`xoxb-`), app-level token (`xapp-`) or signing secret.

The token already identifies the registered app and user. Cherry does not need a Client ID,
Client Secret, redirect URL or a publisher-operated OAuth backend for this connection.
The preset permissions cover search and reads plus sending/drafting/scheduling messages,
reactions, conversations, canvases and lists. Writes run as the token's user. File uploads are
excluded, so the manifest does not include `files:write`.

[Slack permits internal apps to use MCP](https://docs.slack.dev/ai/slack-mcp-server/), so this setup
requires no public Marketplace listing. The app must be internal to the workspace where it is used;
an unlisted app distributed to other workspaces is not eligible. The connection remains subject to
workspace approval, app settings and the user's actual access.

## Connection And Recovery

- Cherry uses the existing credential-entry screen and stores the token in the shared native secure
  credential store. SQLite stores only a reference to that credential.
- The token is sent as a Bearer credential only to `https://mcp.slack.com/mcp`. Connection validation
  discovers `slack_read_user_profile` without reading workspace content or invoking a write. This
  establishes service access, not that every tool or resource is accessible.
- The local allowlist admits 25 tools: 14 reads and 11 writes. Slack supplies their schemas and
  results. Existing tool approval applies, and uncertain writes are never automatically replayed.
- This manual method accepts `xoxp-` user tokens. It does not accept rotating `xoxe...` tokens or store
  refresh tokens. If an existing app already uses PKCE/token rotation, create a separate internal
  app for manual-token use instead of pasting a short-lived rotating token.
- Without token rotation, the user access token does not expire automatically. The 12-hour expiry
  applies to tokens issued with [token rotation](https://docs.slack.dev/authentication/using-token-rotation/)
  enabled. This connection does not require scheduled renewal.
- When a token becomes invalid or is revoked, disconnect and enter a new user token. Updating scopes
  in Slack may require reinstalling the app to grant the new permissions.
- Token replacement requires disconnecting first, preventing a connection from silently switching
  accounts or workspaces. Agents must be assigned to the new connection afterward.
- Disconnecting removes the local connection and credential. It does not revoke the Slack token;
  revoke or remove the app in [Slack application management](https://slack.com/apps/manage) when
  needed.
- Earlier `slack_user` OAuth connections are no longer supported and require disconnecting before
  entering a manual token. Their credentials are not automatically converted. Remove their old
  authorization in Slack if it is no longer needed.

## Validation Status

No live Slack connection or device acceptance is established by this implementation. Connection
setup, the internal-app MCP switch and admitted tools need acceptance with the intended workspace
and token when verification is explicitly authorized. Tests, builds and device checks follow
[Testing And CI](./testing-and-ci.md) and the active task's verification permissions.

## Official References

- [Slack user-token types](https://docs.slack.dev/authentication/tokens/#user-tokens)
- [Slack MCP setup and Bearer token example](https://docs.slack.dev/ai/slack-mcp-server/developing/)
- [Slack MCP app eligibility and tool scopes](https://docs.slack.dev/ai/slack-mcp-server/)
