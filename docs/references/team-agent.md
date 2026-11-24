# Team Agent

Team Agent is the third conversation source, beside this phone's Agents and paired desktop
Agents. The team server owns execution, tools and personal conversation history. Mobile observes
that service directly; it does not run these Agents through the local Host or the desktop protocol.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `shared/contracts/teamAgent.ts` | Credential-free directory, session, message, capability and action values |
| `backend/services/teamAgent` | App-owned `TeamAgentRuntime`, memory drafts, submission state and observation lifetimes |
| `backend/services/enterprise/teamAgent` | Enterprise authorization, `/ai-employees` protocol, capability derivation and submission recovery |
| `frontend/appShell/conversation/team` | Catalog source, opaque session references, foreground observation/resource hooks and display-only message projection |
| `frontend/features/chat/team` | `/team`, readonly details and composer |
| `bootstrap/runtime/createAppBootstrapRuntime` | Inject adapters and dispose the team runtime with the app owner |

The common runtime receives `TeamAgentAdapter` implementations. Each connection represents one
immutable authenticated context. Agent IDs and session IDs are opaque outside that adapter;
employee grouping is optional. A community implementation can supply the same normalized values
without copying the runtime or UI. Bootstrap currently injects the enterprise adapter only: the
community Team service address, authorization and protocol have not been confirmed.

Organization-delivered local Agents and community Cloud models keep their existing behavior.
Configuration synchronization provisions the phone's execution resources; it does not import
Team conversations or grant access to Team execution.

## Feature Map

| Feature | Current behavior |
| --- | --- |
| Entry | Sidebar source menu and the `Agents` tab (`/agents`) Team Agents view for an authenticated enterprise account; `/team` also handles sign-in and empty states |
| Directory | Employee groups and main/assistant Agents; partial list reads retain healthy sessions, with concurrency four |
| Personal sessions | List and create on the user's first send (or header new-chat draft); selecting an Agent never creates a session automatically |
| Chat | Text, reasoning, tool progress/results, cancellation and failed-run state in the shared workspace |
| Live updates | Full snapshots over SSE while the selected session runs; foreground/reentry reads the server again |
| Send | Text only, enterprise limit 16,000 UTF-16 code units; one submission per session at a time |
| Uncertain send | Keep draft and request identity in memory; another submission requires an explicit duplicate warning |
| Stop | Send a cancellation signal; only a subsequent server snapshot establishes terminal state |
| Approval / clarification | Hermes plus server authorization; match the current pending ID and request ID |
| Delete | Single-session deletion for ready Astra targets with explicit `canDelete`; other delete actions are absent |
| Details | Model, Skills and MCP status are readonly (header info action, with memory notice); optional WebP portrait falls back to the existing avatar |
| Usage | Render model, tokens and timing only when the server supplies them |
| Community Team | Adapter boundary available; no speculative endpoints or credentials |

There are no Team attachments, local workspace/tool actions, Agent editing, transcript export,
translation, durable input recovery, push notifications or paginated history in this integration.
The server currently supplies whole snapshots, without the desktop history revision/cursor protocol.
Snapshots with image, file, or artifact parts still retain the text and tools that Mobile displays.

## Identity And Data Lifetime

`AccountRuntime` exposes a backend-only enterprise context. Its key includes the active profile,
service address and sign-in generation. Successful reauthentication replaces that generation even
when the same profile remains open. Sign-out withdraws the context before awaiting network or
credential deletion. Token rotation keeps the same generation.

Team requests check their captured context before and after token/network reads. The adapter reuses
`createEnterpriseSession` to capture the login for credential reads and refusal callbacks, so a late
401 or 403 cannot refuse a replacement login. Private request replay retains the existing account
transport behavior. SSE binds the same context and rejects redirects.

Team content, titles, tool data, drafts and uncertain submissions are memory-only. They do not enter
SQLite, MMKV, the desktop command journal, local input history, backups or translation/export caches.
Catalog query keys include the context; account replacement cancels and evicts old queries. Removed
targets lose their visible transcript. Portrait data URLs use memory caching only.

Route disposal or backgrounding releases observation, never remote execution. A submitted request
may settle after its route has gone; it can clear only its matching draft in the original context.
An account replacement aborts reads and streams, retires old handles and clears all Team memory.
App restart reads server history and never automatically resubmits a remembered input.

## Enterprise Protocol

The adapter uses the current account's enterprise API address and product/private token. Ordinary
REST uses the shared HTTP client and enterprise request wrapper; SSE uses `expo/fetch` with a
45-second heartbeat deadline, bounded frames and reconnect backoff. Unknown runtimes get no actions.

Astra may retry a submission only after the server declares `idempotentSubmit`, querying the
original request returns `missing`, and the retry retains the exact original request ID. Hermes
does not automatically resend: its accepted stream ID can differ from the client request UUID.
HTTP refresh after an explicit 401 is distinct from retrying a network-ambiguous submission.

All remote tools cross `ConversationMessage.tools` and inline readonly resource values, including
an empty tools array. Tool names and paths never select a local file, MCP or Agent-management
renderer. Details are parsed through a field allowlist and never invoke the local Agent editor.

The target deployment must expose the matching `/ai-employees` endpoints and personal-session
authorization. Portraits and usage fields are optional enhancements. Source compatibility does
not establish that a particular deployment has enabled those endpoints.
