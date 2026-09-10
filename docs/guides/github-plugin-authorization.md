# GitHub Plugin Authorization

Cherry uses a publisher-owned **OAuth App** registered on GitHub. The mobile client signs the user
in, obtains a user access token, and supplies it to GitHub's official hosted MCP service. GitHub
operations run through MCP. Users do not register an application, install a GitHub App, or select
an installation's repositories in Cherry.

## Publisher Configuration

Create an OAuth App under GitHub developer settings, not a GitHub App. Use separate registrations
for development, preview and production so each has its own callback and credentials.

| Expo profile | Authorization callback URL |
| --- | --- |
| `development` / `development-simulator` | `cherrystudio-dev://plugins/github/callback` |
| `preview` | `cherrystudio-preview://plugins/github/callback` |
| `production` | `cherrystudio://plugins/github/callback` |

The callback comes from the native application's configured scheme. A cold launch during OAuth
requires a new attempt because the original PKCE verifier exists only in memory.

The client requests `repo offline_access`. The admitted MCP tools read repository contents and
read/write issues and pull requests, including private repositories. OAuth's `repo` scope is
broader than this tool allowlist; the consent screen must disclose that repository access includes
read and write permissions. The token response must include `repo` before credentials are accepted.
No email, organization-administration, workflow, gist or repository-deletion scope is requested.
Organization policies and the user's actual access still constrain MCP operations.

`offline_access` requests an expiring token and refresh token. The client handles complete token
rotation and also accepts a non-expiring access token without inventing an expiry or refresh token.
An incomplete refresh response requires reconnecting instead of reusing an uncertain refresh token.

## Development And EAS Environments

Set these project-level variables in the Expo project's Environment variables page. Create distinct
values in `development`, `preview` and `production` using the matching OAuth App registration.

| Variable | Value | EAS visibility |
| --- | --- | --- |
| `EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_ID` | OAuth App Client ID | Plain text |
| `EXPO_PUBLIC_GITHUB_OAUTH_CLIENT_SECRET` | OAuth App Client Secret | Sensitive |

There is no App Slug variable. The earlier GitHub App variable names are not used.

For local development, pull the development environment:

```bash
eas env:pull --environment development
```

This writes the root `.env.local`; preserve any existing unrelated entries when updating it.
Alternatively copy the empty entries from [`.env.example`](../../.env.example) and supply the
development values manually. Do not commit populated files. Both Git and the EAS source archive
ignore `.env` and `.env*.local`.

Restart the development server and fully reload the app after changing values so plugin registration
runs with the new configuration. The existing development scripts use `PROFILE=development`.
The [local build wrapper](./local-builds.md) also loads `.env` and `.env.local` before EAS starts;
it does not select a profile-specific env file. Keep local values matched to the intended profile.

[eas.json](../../eas.json) explicitly selects the matching EAS environment for development, preview
and production builds; the simulator profile inherits development. Production cloud builds use EAS
variables directly, including builds started by the existing GitHub Actions workflows. Do not copy
the credentials into workflow YAML or `eas.json`.

EAS controls how values are supplied during bundling; it is not a runtime configuration service.
Changing values does not alter an already installed bundle. If EAS Update is introduced, explicitly
select the matching `--environment`; Secret-visibility variables cannot be pulled locally or used
for updates, so they are unsuitable for these client variables.

Both values are embedded in the native JavaScript bundle. GitHub documents client secrets in public
native clients with PKCE; this value is not proof that a request came from an authentic Cherry
binary. Sensitive visibility hides it in EAS logs and the dashboard, not from installed clients.
Never embed a GitHub App private key or a publisher's personal access token. A confidential
server-side token broker would be a separate deployment design.

## Connection And Recovery

Missing or invalid configuration hides the browser flow and retains personal-token entry.
Existing personal tokens continue to work without migration.

The `github_user` method uses the generic connection screen: system-provided in-app authorization,
account confirmation, read-only hosted MCP `get_me` validation, then local commit. It does not call
installation or repository-list endpoints or require a nonzero repository count. The callback's
exact redirect, state, deadline and single consumption are validated before exchanging the code.

`WebBrowser.openAuthSessionAsync` opens `ASWebAuthenticationSession` on iOS and browser Custom Tabs
on Android. GitHub redirects to the configured callback to complete the session. Feishu shares the
connection screen but uses `openBrowserAsync` with device-code polling. GitHub keeps the OAuth App
authorization-code flow with PKCE; it does not require device-code entry or an embedded WebView.

`/user` supplies a stable numeric ID and display login. Same-account reauthorization, including
login renames, retains the connection and Agent configuration. A different ID or an incomparable
personal-token connection requires explicit disconnect first. Disconnect disables old bindings and
deletes the old connection; connecting again requires choosing Agents again.

The completed credential contains application identity, account facts and the complete token bundle
through the shared `PluginCredentialStore`. SQLite contains only an opaque native-secret reference.
Database restores on another device require reauthorization. Pending credentials are memory-only.
Cancellation, process interruption and local save failure require a new attempt. A failed
reconnection leaves the previous connection intact; there are no persistence retries or journals.

Concurrent requests share one refresh result, including failure. Caller cancellation releases that
caller immediately; disconnect/replacement/host disposal cancel the renewal owner. Full token
rotation is saved before a request can use it. An ambiguous refresh or failed local save prevents
another automatic refresh for that grant in the current runtime and directs the user to reconnect.

Connection status reads use local state only. Missing credentials and confirmed rejection require
reauthorization; resource 403, quota and network failures retain their own reasons. A late 401 for an
older token is ignored. MCP writes are never automatically replayed. Local disconnect completes
before a five-second remote token-revocation attempt. Unconfirmed revocation links to OAuth
application settings.

## Acceptance Before Shipping

The implementation has no live OAuth App or device acceptance evidence. With the intended
registration and explicit authorization to run verification, cover:

- iOS/Android browser return, cancellation, denial, expiry, duplicate callbacks and cold launch.
- The admitted MCP tools with the actual OAuth grant, including private repository access and
  organization restrictions. A successful `get_me` does not prove access to every repository.
- Account confirmation without any repositories or GitHub App installation.
- Same-account renewal, login rename and explicit disconnect before account replacement.
- Expiring and non-expiring tokens, concurrent refresh, rejection and ambiguous rotation failures.
- Local disconnect, successful/failed remote revocation, native-store failures and restored databases.

Focused suites are `githubOauth.test.ts`, `GithubAuthorizationRuntime.test.ts`,
`createAuthorizationObserver.test.ts`, `PluginCredentialStore.test.ts`,
`createPluginsModule.test.ts`, `createBuiltInMcpClient.test.ts` and `createHttpClient.test.ts`
in their owning modules. Follow [Testing And CI](./testing-and-ci.md) and active verification permissions.

## Official References

- [MCP host integration](https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md)
- [OAuth App authorization, PKCE and token refresh](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- [Public-client credentials](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app)
- [System browser authentication sessions](https://docs.expo.dev/versions/latest/sdk/webbrowser/)
- [Token revocation](https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token)
- [EAS environment management](https://docs.expo.dev/eas/environment-variables/manage/)
- [EAS environment usage](https://docs.expo.dev/eas/environment-variables/usage/)
