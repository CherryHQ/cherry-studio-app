# Slack Plugin Authorization

Cherry owns the Slack application registration. Users choose **Connect with Slack**, sign in,
select a workspace and authorize Cherry. The system authentication session returns to the app;
Cherry checks the workspace/user identity, discovers an admitted read tool and saves the connection.
Users do not create applications, enter client IDs or configure scopes.

## Publisher Setup

Register a Cherry-owned app in [Slack application settings](https://api.slack.com/apps). Slack's
[official MCP service](https://docs.slack.dev/ai/slack-mcp-server/) accepts internal and
Marketplace-published apps; an unlisted app distributed to other workspaces cannot use it.
Internal development is limited to that app's workspace. Public distribution requires an eligible
publisher registration; a configured client ID alone does not establish that eligibility.

Configure the application once:

1. Enable PKCE and token rotation. The native authorization-code flow uses S256 proof and does not
   send a client secret. Slack notes that disabling PKCE afterward requires contacting support.
2. Register the exact callback for every variant using that application:

   | App variant | Callback |
   | --- | --- |
   | Production | `cherrystudio://plugins/slack/callback` |
   | Development | `cherrystudio-dev://plugins/slack/callback` |
   | Preview | `cherrystudio-preview://plugins/slack/callback` |

3. Configure the user scopes in `SLACK_REQUESTED_SCOPES` in
   [slackCredentials.ts](../../src/backend/services/builtInMcp/plugins/slack/slackCredentials.ts).
   The current 29 scopes cover the 25 admitted tools. File uploads and `files:write` are excluded.
   Cherry accepts rotating user tokens with exactly this scope set, including email access and
   the declared message, conversation, reaction, canvas and list writes. Do not add unrelated scopes
   or bot permissions to this registration.
4. Set `EXPO_PUBLIC_SLACK_OAUTH_CLIENT_ID` to the application's public Client ID in the matching EAS
   environment. Use **Plain text** visibility. For local development, supply it in `.env.local`;
   [`.env.example`](../../.env.example) contains an empty entry. Configure a separate internal
   development app if needed, with the matching development callback.

Only the public ID is embedded in Cherry. No publisher token, client secret or token-broker backend
is required by this native PKCE flow. Do not reuse another product's client ID: its registered
callbacks and app permissions belong to that integration.

EAS supplies the value during bundling; it does not update an installed app at runtime. Missing or
invalid configuration makes new sign-in return the existing unavailable error. It does not fall
back to asking users to create an application. Build commands and environment loading follow
[Local EAS Builds](./local-builds.md); this setup guide does not run a build.

## Connection And Recovery

- The shared connection screen opens `openAuthSessionAsync`; no embedded WebView or manual token
  copying is involved. Pending state and PKCE proof remain in memory. A cold launch requires a new
  authorization attempt.
- Exact callback, state, deadline and single code consumption are checked before token exchange.
  `auth.test` binds the workspace and user. New connections and same-identity reauthorization finish
  automatically; changing identity requires disconnecting first.
- The user token goes to the fixed `https://mcp.slack.com/mcp` endpoint. Tool discovery supplies the
  remote schemas; the local allowlist controls read/write admission. Writes are never automatically
  replayed after an uncertain result.
- Existing grants keep their issuing application's ID and callback for token refresh. Previously
  saved personal application settings are no longer used for new sign-in. Switching the publisher
  configuration does not rewrite or erase an existing grant.
- Former Web API and read-only MCP grants need disconnect and reauthorization to obtain the current
  scopes. Their tokens remain revocable. Normal disconnect removes the local connection and attempts
  remote revocation; unresolved revocation links to Slack's application management page.
- Workspace administrator approval and the user's actual access still constrain the connection.

## Remaining Release Work

The code supports publisher-owned sign-in, but does not create a Slack registration, obtain
Marketplace approval, or supply a real Client ID. Complete that publisher setup before offering
sign-in to external workspaces. No live Slack or device acceptance is established by this change.
With explicit verification authorization, cover browser return/cancellation on both platforms,
workspace approval, all admitted tools, token rotation, identity changes and revocation.

## Official References

- [Slack's preconfigured Claude connection](https://docs.slack.dev/ai/slack-mcp-server/connect-to-claude/)
- [Slack native PKCE authorization](https://docs.slack.dev/authentication/using-pkce/)
- [Slack MCP service and app eligibility](https://docs.slack.dev/ai/slack-mcp-server/)
- [Slack authorization metadata](https://mcp.slack.com/.well-known/oauth-authorization-server)
