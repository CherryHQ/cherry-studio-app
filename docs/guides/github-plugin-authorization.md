# GitHub Plugin Authorization

Cherry uses a publisher-owned GitHub App. End users sign in and authorize Cherry, select repository
access, then choose which Agents may use the connection. Users do not register an application.

## Publisher Configuration

Register a GitHub App under the Cherry publisher account or organization. Start with repository
Contents read, Issues write, Pull requests write, and GitHub's required Metadata read permission
for the current tool set. Keep expiring user access tokens enabled. Installation access and user
authorization are separate; support installation on the intended user/organization accounts.
The authorization page is the authority on the actual requested permissions.

Set these environment variables for the corresponding Expo build/update environment:

| Variable | Value from the Cherry GitHub App registration |
| --- | --- |
| `EXPO_PUBLIC_GITHUB_APP_CLIENT_ID` | OAuth client ID, such as the `Iv1.` identifier; not the numeric App ID |
| `EXPO_PUBLIC_GITHUB_APP_CLIENT_SECRET` | Client secret used for code exchange and refresh |
| `EXPO_PUBLIC_GITHUB_APP_SLUG` | Slug in `https://github.com/apps/<slug>` |

The variables are embedded in the native JavaScript bundle. GitHub explicitly documents this
public-client use of the client secret with PKCE; treat the value as public, not as proof that a
request came from an authentic Cherry binary. Never embed a GitHub App private key. A confidential
server-side token broker would be a separate deployment design.

Register the exact callback for every intended profile, preferably using separate applications
for development and production:

| Expo profile | User authorization callback URL |
| --- | --- |
| `development` | `cherrystudio-dev://plugins/github/callback` |
| `preview` | `cherrystudio-preview://plugins/github/callback` |
| `production` | `cherrystudio://plugins/github/callback` |

These are OAuth callbacks, not installation setup URLs. Installation/configuration opens GitHub's
official App installation page; the user returns to Cherry and presses the access-check action.
No unverified installation ID is accepted as evidence of access. A cold launch during OAuth asks
the user to start again because the original PKCE verifier exists only in memory.

Missing or invalid configuration hides the browser flow and retains personal-token entry. No
placeholder credentials are bundled. Existing personal tokens continue to work without migration.
User OAuth tokens use device-only SecureStore; SQLite contains an opaque reference. Database
restores on another device require reauthorization.

## Acceptance Before Shipping

The implementation has no live GitHub App or device acceptance evidence. With the intended
registration and explicit authorization to run verification, cover:

- iOS and Android browser return for each shipping profile, cancellation, denial, expiry, duplicate
  callbacks, route changes and process interruption.
- Personal and organization installations, pending administrator approval, selected repositories,
  repository removal, and explicit access rechecks. No accessible repository must stay in setup.
- The admitted hosted MCP tools with the actual permission grant, including `get_me`. Repository
  count alone does not validate every tool or organization policy.
- Same-account renewal, login rename, account replacement confirmation and disabled Agent bindings.
- Expiring-token refresh, concurrent requests, remote revocation and failed network requests.
  Failed/ambiguous writes must never be replayed automatically.
- Local disconnect, successful and failed remote token revocation, SecureStore failures and restored
  databases. Revoking the entire application on GitHub is broader than this device's disconnect.

Focused regression suites are `githubOauth.test.ts`, `GithubAuthorizationRuntime.test.ts`,
`createPluginsModule.test.ts`, `createBuiltInMcpClient.test.ts`, `McpRuntimeService.test.ts`,
`PluginAuthorizationService.test.ts`, and `createHttpClient.test.ts` in their owning modules.
Follow [Testing And CI](./testing-and-ci.md) and the active task's verification permissions.

## Official References

- [MCP host registration](https://github.com/github/github-mcp-server#install-in-other-mcp-hosts)
- [Public clients and client secrets](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app#client-secrets)
- [User authorization and PKCE](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-on-behalf-of-a-user)
- [Refresh-token rotation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)
- [Installation setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url)
- [User-accessible installations](https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token)
- [Token revocation](https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token)
