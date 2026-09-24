# Remote Access

Status: slices 1–3 (packages, pairing, configuration sync) are implemented. The slices 4–6
migration now includes the shared Agent protocol, domain leases, desktop snapshot sync, durable
command recovery, and frontend conversation adapters. Local chat history, message actions, approvals and
both share routes consume the common contract. The remote chat/sidebar screens now use
the same source/catalog/session boundary; the old Controller entry and `agent-version` gate have been removed after
switching consumers and focused regression checks. This is not device acceptance of the new implementation.

The desktop counterpart is Cherry Studio PR #20717 (`zhangjiadi225/lan-agent-remote-design`).
Mobile #997 keeps #1055 as its stacked base. The approved conversation design replaces the old
controller boundary as well as its transport; pairing and provider synchronization retain their
product interfaces.

## Connection foundation ownership

PR #1055 owns `DesktopConnectionManager`, domain leases, authorization invalidation notifications,
foreground lifecycle, endpoint resolution, native discovery, pairing and provider sync.
Agent subscriptions, in-memory read state and the MMKV command journal remain in PR #997.
See [Desktop location and stable pairing](./connectivity.md) for the discovery and address migration contract.

## What exists and what is replaced

| Today | Replacement |
| --- | --- |
| `main`: `POST /pair` + `GET /v1/export/providers` over plain HTTP (`desktopConnectionClient.ts`), bearer token in SecureStore | One encrypted WebSocket per desktop; pairing and configuration export are JSON-RPC methods inside it; no bearer token |
| PR #997: `secureChannel.ts` (TweetNaCl box), `protocol.ts` (hand-written schemas), `session.snapshot` full overlays, `messages.parts.get`, `artifacts.read` | Noise XX from the shared transport, schemas and reducer from `@cherrystudio/remote-protocol`, journaled events with checkpoints, `parts.list` + `content.read` |
| PR #997: `AgentController` contract, `RemoteAgentRuntime`/`Adapter`/`Actions`, `RemoteAgentCommandJournal`, drawer Local/Remote group, shared chat UI, approval sheets | Replace the controller with frontend conversation consumption and the narrow `Backend.remoteAgent` module; preserve local execution and existing presentation components |

The desktop removed the HTTP routes outright, so a mobile release without this work cannot pair
with a current desktop. Configuration sync therefore ships in the first slice, before Agent access.

See [desktop location and stable pairing](./connectivity.md) for DNS-SD, explicit addresses,
native module ownership and the network-independent pairing migration.

## Desktop contract

- **Invitation QR** (`v: 2`, `t: 'cherry-studio-pair'`): `name`, `port`, `ips`, `invitationId`,
  `invitationSecret`, `desktopIdentity` (Ed25519 peer id), `protocolVersions`. Valid two minutes.
- **Endpoint**: `ws://<ip>:<port>/v1/remote/connect`, binary frames; native clients may include an `Origin` header. Every other
  HTTP route on that listener answers `403` to a LAN peer.
- **Handshake**: length-prefixed plaintext prelude (`{ protocolVersions }` → `{ protocolVersion }`),
  then Noise XX (`@libp2p/noise`, pure-JS crypto) with the negotiated version bound into the
  prologue (`cherry-remote-noise-xx-v1`). The phone pins `desktopIdentity`; the desktop learns the
  phone's Ed25519 key from the handshake. Application records are length-prefixed JSON-RPC 2.0.
- **Limits** come from `remoteLimits` in the protocol package: 64 KiB records, 16 in-flight
  requests, 256 KiB unacknowledged event bytes, 10-minute access tokens with a 30-second refresh
  grace, 20-second heartbeat, 60-second idle timeout.
- **Methods**: `connection.hello|authenticate|refresh|ping`, `pairing.claim|get`,
  `configuration.export.prepare|read`, and the `agent.*` map from `@cherrystudio/remote-protocol/agent`.
  Notifications: `agent.events`, `agent.subscriptions.resetRequired`, `connection.closed`.
- **Authorization**: the desktop user approves a subset of the requested capabilities
  (`configuration`, `agent`) while pairing; each becomes a grant id. `connection.authenticate`
  needs only `deviceId` because identity is the Noise key. Revocation surfaces as `GRANT_REVOKED`
  on the next request or write.
- **Commands** carry a client `commandId`; the desktop keys receipts by device + grant + command,
  returns the same receipt for an identical retry and `IDEMPOTENCY_CONFLICT` for a changed body.
  `accepted` means admitted, `applied` means the owner ran, `interrupted` means the desktop cannot
  prove the side effect.

## Shared packages

- `packages/remote-protocol`: mirrored from the desktop repository (`desktop-sync-manifest.json`
  domain `remote-protocol`, strategy `semantic-port`; only `package.json` differs). Backend-only
  import. Its tests (`applyAgentEvents`, `installAgentCheckpoint`, canonical encoding) run unchanged
  under Vitest.
- `packages/remote-transport`: mirrored the same way. Its Node tests pass under the mobile
  toolchain; the app loads it through dynamic `import()` so the ESM `@libp2p/*` chain never rides
  along with the service registry (Jest cannot resolve it). Android device pairing and configuration sync were verified against the desktop on 2026-09-22.
  Metro applies the libp2p legacy browser maps so native bundles use the pure-JS entries.
  iOS interoperability and Agent execution remain unverified.
- RN `WebSocket` is wrapped into the transport's `RemoteSocket` shape (`binaryType = 'arraybuffer'`,
  `bufferedAmount` reported as 0, `close(code)`).

## Session read cache

[Remote Session Read Cache](./session-read-cache.md) documents the cross-page read cache,
consumer contract, binding invalidation, loading changes, implementation slices and acceptance
criteria. The first in-memory implementation and basic Android return-navigation checks are complete. A React Native
ShadowTree assertion observed during final verification blocks full device acceptance; quantitative
performance acceptance also remains pending.

## Ownership

[Service Dependencies And Ownership](./service-ownership.md) is the current source-backed graph,
consumer status, lifecycle matrix and remaining design work. It separates mobile frontend/backend
ownership from desktop authority and distinguishes implementation from acceptance.

```text
Settings / onboarding → Backend.desktopConnections → DesktopConnectionRuntime (workflows)
Frontend conversation adapters → Backend.remoteAgent → RemoteAgentRuntime (Agent scopes)
Both runtimes → DesktopConnectionManager (one channel, domain leases, AppState, reconnect)
DesktopConnectionManager → DesktopSession (Noise, JSON-RPC, heartbeat and authorization refresh)
RemoteAgentRuntime → SessionSync (in-memory desktop state) / RemoteAgentActions (MMKV command journal)
```

- `DesktopConnectionRuntime` owns pairing/configuration tasks and drains them before the manager.
  It does not expose an authenticated session to business modules.
- `DesktopConnectionManager` opens channels only for retained demand and owns domain-specific
  revocation. Releasing a configuration lease cannot cancel an Agent execution. Temporary pairing
  channels also belong to its app lifetime; adopting an approved channel into the pool remains a
  follow-up in the migration.
- `DesktopSession` owns one physical channel. It dispatches shared protocol methods and notifications;
  it does not own reconnect policy or provider imports.
- `RemoteAgentRuntime` retains source scopes and admitted commands across route disposal.
  Concurrent source acquisitions reserve their consumers before waiting, so cancelling one route
  cannot release the scope another route is acquiring. `RemoteAgentScope` translates Agent reads/observations/actions. It reacts to lease state instead
  of registering another physical AppState/reconnect owner. The old `RemoteAgentAdapter`,
  `RemoteAgentClient`, private protocol and private secure-channel implementation are removed.
- The frontend `appShell/conversation` module owns the shared read model and the catalog sources;
  its `remote/` sub-module owns the desktop session contract, revisioned history windows, drafts and
  operation recovery views. Local chat keeps its own client, Session-keyed history and projection in
  `features/chat/runtime`; it implements no session lifecycle. Both chat pages feed the same
  workspace, approvals and message actions, both sidebars use the same catalog, and both share
  routes use the same selection controls and export preparation. Retired catalogs/windows/deferred
  reads are cancelled and evicted from Query. Unsent drafts use a stable identity/grant binding
  independent of the ephemeral Query scope.
- Remote session state is never written to SQLite. Every new subscription installs a desktop
  checkpoint. The command journal receives its MMKV storage from composition and never resolves
  a replacement host through `application.get` during late work.
- Local Agent/MCP execution and `DocumentExportRuntime` have no desktop connection dependency.

## Persistence

| Store | Content |
| --- | --- |
| `desktop_connection` (migrated) | `id` is the mobile connection ID; `deviceId` is desktop-assigned, `name`, `addresses[]`, `port`, `desktopIdentity`, `grants` (`{ domain, grantId }[]`), `status`, `lastFetchedAt`; drops `baseUrls`, `activeBaseUrl`, `desktopVersion`. The migration recreates the table and drops HTTP-era rows, which can no longer connect. |
| SecureStore | `remote-device-identity` (private key protobuf, hex). HTTP-era `desktop-connection-token.*` entries are simply no longer read. |
| MMKV `cherry-remote-agent-commands` | Version 2 stores fixed command IDs, exact parameters and receipts plus the two-step start workflow. A record this build cannot read is dropped, never replayed; old pairing bindings are not replayed into a different identity. This is a record of commands the phone sent without a receipt, not a cache. |
| Memory only: `RemoteSessionReadCache` | Remote history pages, parts and content. Bounded (32 MiB total, 1 MiB per value, 10 inactive sessions, 5-minute idle), cleared when a grant or pairing is invalidated, empty after every process start. |

The desktop is the only source of truth for a remote conversation; the phone-side copy is never
trusted for correctness. Every subscription installs a desktop checkpoint and every history window
carries the desktop's `historyVersion`, so a stale copy is rejected and re-read rather than shown as
current. The read cache therefore exists only for display continuity inside one process and is
deliberately not persisted: a cold start shows no remote history until the desktop answers.
Access tokens and remote session projections/cursors are never persisted either. Frontend Query
entries use opaque source/session/version keys; a new identity or grant retires that source, and
grants and protocol types do not enter frontend components.

## Flows

**Pair.** Scan → validate the v2 payload → user picks capabilities (both on by default) → open a
session against the pinned identity without authenticating → `pairing.claim` → show the returned
six-digit code and "approve on your desktop" → poll `pairing.get` every two seconds until
`approved` / `rejected` / `expired` (invitation life) → on approval store the connection with its
grants, retire the previous pairing scope, and if `configuration` was granted run the existing
preview/import immediately. Re-pairing an existing desktop replaces its grants and identity binding.

**Configuration import.** `configuration.export.prepare` → `configuration.export.read` in 24 KiB
pages until `eof` → verify `byteLength` and `sha256` → parse with the existing
`DesktopProvidersSnapshotSchema` (payload `version: 1` is unchanged) → existing
`DesktopConnectionService.preview/import`. The export is pinned five minutes on the desktop.

**Agent session.** Every `agent.sessions.subscribe` omits the cursor, including reconnects and
process restarts. Read every checkpoint page, validate with `installAgentCheckpoint`, install the
projection and cursor in memory, then call `agent.subscriptions.activate` to receive subsequent
changes. Each `agent.events` batch goes through `applyAgentEvents`; on success the in-memory
projection and cursor are updated before acknowledgement. On `gap`/`epoch`/`revision`/`content`,
the subscription is closed and re-prepared without a cursor. `agent.subscriptions.resetRequired`
does the same. Live parts that arrive as
content refs are fetched with `agent.content.read` at the given revision before the batch is
applied; the checkpoint lease covers those reads. History is read at the projection's
`historyRevision` (`messages.list`, `parts.list`); `REVISION_EXPIRED` restarts that traversal at
the current revision without touching the live overlay. `history.committed` invalidates the
history queries; `message.removed` after it releases the live message.

**Commands.** `RemoteAgentCommandJournal` persists `commandId` + params before sending. First send
records both create/send IDs before creating a session and retains the created session if sending
fails. `accepted` remains pending until the owner outcome is known. `messages.send` carries `expectedIdleRevision` from the projection's session; `CONFLICT`
restores the draft. `executions.cancel` carries the active execution id. `interactions.respond`
carries `expectedRevision`, `expectedExecutionId` and `inputDigest` from the interaction it shows.
A lost response is recovered with `agent.commands.get` and, when absent, by resending the same
`commandId`; `IDEMPOTENCY_CONFLICT` and `interrupted` stop recovery and surface to the user.
Uncertain commands cannot be dismissed. After a terminal result is consumed, dismissal removes
the record (and both records of a completed start workflow); an empty binding is removed from MMKV.
The journal is not subject to the read cache's TTL or capacity eviction.

**Revocation and repair.** Domain `GRANT_REVOKED`/`FORBIDDEN` retires only that domain's leases.
`UNAUTHENTICATED` during authentication or an identity-pin failure requires repairing the device
pairing. Late refresh results cannot restore a grant that the manager has already revoked.
Identity/grant comparisons protect credential writes against a concurrent re-pair.

## App lifecycle

- No session is opened by lifecycle phases. Sessions open when a screen needs one (sync preview,
  remote chat source) and close after the last consumer releases them plus a short grace.
- Background: the session is suspended and subscriptions closed. Foreground: reconnect,
  re-authenticate and subscribe without a cursor to install the current desktop checkpoint.
  Read previews may remain in memory but cannot authorize actions. Neither path cancels desktop execution.
- One session per desktop; the Agent adapter and the configuration importer share it.

## Slices

| Slice | Delivers | Proof |
| --- | --- | --- |
| 1. Transport spike | protocol + transport packages mirrored, RN socket adapter, `deviceIdentity` | Development client on a device completes the Noise handshake and `connection.ping` against a desktop dev build; package tests pass under the mobile toolchain |
| 2. Pairing | v2 QR, capability choice, claim/poll UI, `desktop_connection` migration, identity in SecureStore | Pair, reject, expire and re-pair against the desktop; old rows show `needs-repair` |
| 3. Configuration sync | export.prepare/read, existing preview/import | Import matches the HTTP-era result on the same desktop; `FORBIDDEN` without the grant |
| 4. Agent read path | `SessionSync`, in-memory projection, history/parts/content reads | Checkpoint install, live text/tool events, fresh checkpoints on reconnect and forced reset, all reduced by the package reducer; desktop fixtures covered by Jest |
| 5. Agent commands | send/cancel/respond over the journal, `commands.get` recovery | Duplicate `commandId` returns the receipt; changed body conflicts; idle-revision conflict restores the draft |
| 6. Lifecycle and acceptance | background/foreground, revocation, multiple desktops, device acceptance per `docs/guides/parallel-device-testing.md` | iOS and Android acceptance with a paired desktop; screenshots on the PR |

Slices 1–3 replace what `main` ships and are releasable on their own; 4–6 land the PR #997 scope.

## Questions And Workspace Selection

`agent.interactions.respond` accepts an explicit `response`: `{ kind: 'approve' }`,
`{ kind: 'deny', reason? }`, or `{ kind: 'answer', answers }`. Answers are keyed by the original
question text. Question interactions advertise `kind: 'question'`; their input remains an
inline/content-ref resource, so checkpoints and event summaries do not duplicate the form.
The desktop validates all question keys and nonblank answers against the current revision,
execution and input digest, then passes the original input plus answers to its existing runtime.
The mobile adapter materializes the form into the common interaction resource and reuses the
question sheet. Exact response parameters and command IDs survive receipt recovery.

`agent.workspaces.list` advertises `systemWorkspace: true` when supported. Creation accepts
`workspace: { kind: 'system' }` or `{ kind: 'registered', id }`; only the desktop resolves the
physical directory. The returned session includes the real `workspaceId` and `workspaceKind`.
Mobile offers the localized default choice only after the desktop advertises it; an older desktop
still requires a registered workspace. The system choice has a source-bound frontend ref, never
a fabricated workspace ID on the wire.

Legacy `decision: approve | deny` and `workspaceId` commands remain valid for existing clients and
persisted journals. Mobile keeps these wire forms for plain decisions and registered workspaces;
new answers, denial text and system creation use the explicit forms. A command cannot combine both
forms. Desktop supports denial reasons in the protocol; the current mobile sheet has no reason
editor. Local Agent approvals retain their existing decision-only capability.

These additions require the matching desktop implementation. Device acceptance is still pending.

## Out of scope

Relay service, file bytes for `file` parts (desktop exposes metadata only), approval cards that the
desktop persists after a turn (listed and answerable, not streamed), and any write to desktop
Agents or registered workspaces. Creating a session-owned system workspace is supported.

## Message usage

The optional `AgentMessage.usage` is a bounded, host-owned materialized summary: input/output/total
tokens, cache and reasoning breakdowns, request count, per-currency costs, unpriced-record status,
and completed runtime/tool/approval durations. Missing fields mean unknown; measured zero remains
zero. Historical scalar completion time is used only when the host has no runtime timing.

History reads and terminal message events use the same projection. Message events and checkpoint
pages retain it through replay/recovery, including an unsaved terminal answer. Older hosts may omit
usage without blocking pairing or configuration synchronization. This does not expose the host's
per-request accounting ledger or infer main-model latency/speed from multi-model totals.

`RemoteMessageView` carries the summary to the shared message usage button/detail presentation.
Only the local detail adapter loads `/ai-usage-records` from the mobile database; remote details use
the host snapshot and never query a local message ID. Mobile still needs an updated desktop process
to receive this additive field; local checks do not constitute device acceptance.

Model identity has two owners: `agent.agents.list[].model` describes the Agent's current configured
model; `AgentMessage.model` describes the actual model used by that historical message. The Agent
catalog uses the existing shared picker `modelName` presentation. Explicit `null` means unconfigured;
an omitted catalog field from an older host remains unknown. Message names come from the matching
immutable snapshot and fall back to the recorded model ID, never the Agent's current configuration
or the phone's provider catalog. Terminal events and checkpoints retain the same identity. Only
public model ID, provider ID, and display name cross the boundary.

## Upgrading from the connection foundation

The connection foundation (#1055) applies `0001_hot_cammi` directly to the final Noise pairing
schema, including configured endpoints. The Agent layer (#997) adds no SQLite schema or migration:
remote session state is rebuilt from the desktop, read caches are in memory, and command records
use their dedicated MMKV store. The unshipped `0002_daffy_nemesis` projection migration and its
snapshot/journal entry have been withdrawn.

Unreleased development schemas are not supported upgrade sources; there is no compatibility
backfill migration. A development database that already applied the withdrawn migration must be
recreated before continuing migration testing. The app does not automatically delete that database
or its obsolete table. Local chat data and paired-device persistence keep their existing owners.
