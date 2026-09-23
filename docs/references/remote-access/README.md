# Remote Access

Status: slices 1–3 (packages, pairing, configuration sync) are implemented; slices 4–6 (Agent
access, commands, lifecycle) are still the plan below. The desktop side is implemented in Cherry
Studio PR #20717 (`zhangjiadi225/lan-agent-remote-design`). This document supersedes the HTTP
pairing that `main` shipped and the snapshot-based prototype in mobile PR #997.

## Connection foundation ownership

PR #1055 owns `DesktopConnectionManager`, domain leases, authorization invalidation notifications,
foreground lifecycle, endpoint resolution, native discovery, pairing and provider sync.
Agent subscriptions, read caches, commands and projection persistence remain in PR #997.
See [Desktop location and stable pairing](./connectivity.md) for the discovery and address migration contract.

## What exists and what is replaced

| Today | Replacement |
| --- | --- |
| `main`: `POST /pair` + `GET /v1/export/providers` over plain HTTP (`desktopConnectionClient.ts`), bearer token in SecureStore | One encrypted WebSocket per desktop; pairing and configuration export are JSON-RPC methods inside it; no bearer token |
| PR #997: `secureChannel.ts` (TweetNaCl box), `protocol.ts` (hand-written schemas), `session.snapshot` full overlays, `messages.parts.get`, `artifacts.read` | Noise XX from the shared transport, schemas and reducer from `@cherrystudio/remote-protocol`, journaled events with checkpoints, `parts.list` + `content.read` |
| PR #997: `AgentController` contract, `RemoteAgentRuntime`/`Adapter`/`Actions`, `RemoteAgentCommandJournal`, drawer Local/Remote group, shared chat UI, approval sheets | Kept. Only the layer below the adapter changes |

The desktop removed the HTTP routes outright, so a mobile release without this work cannot pair
with a current desktop. Configuration sync therefore ships in the first slice, before Agent access.

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

## Ownership

```text
Settings / onboarding device screens, DesktopProviderSyncScreen, drawer Remote group, remote chat
  → Backend.desktopConnections (pair / remove / preview / import)   unchanged contract
  → Backend.agentController.open(connectionId)                        from PR #997
  → DesktopConnectionRuntime          owns identity, connections, pairing, one DesktopSession each
      → DesktopSession                socket + Noise channel + JSON-RPC client + notifications
  → RemoteAgentAdapter                controller projection, commands, recovery (PR #997)
      → SessionSync                   checkpoint install, event apply, ack, persisted cursor
```

- `src/backend/services/desktopConnections/`
  - `DesktopConnectionRuntime` stays the credential and connection owner (`Phase.Gate`,
    `AppStatePolicy('continue')`). It loads or creates the device identity, opens sessions on demand,
    and exposes `session(connectionId)` to the Agent adapter. No connection is opened at startup.
  - `deviceIdentity.ts`: one Ed25519 identity per install, protobuf bytes in SecureStore
    (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Losing it means pairing again; that is the intended bound.
  - `DesktopSession.ts` replaces `desktopConnectionClient.ts`: tries each stored address in order,
    performs the handshake, `connection.hello`, `connection.authenticate`, refreshes the token before
    expiry, answers heartbeats, dispatches notifications, reconnects with bounded backoff while it
    has consumers, and suspends when the app goes to background. It maps `RemoteFailure` reasons to
    the existing `desktopError()` codes.
- `src/backend/services/remoteAgent/` keeps `RemoteAgentRuntime`, `RemoteAgentAdapter`,
  `RemoteAgentActions` and the shared `AgentController` contract. `RemoteAgentClient`,
  `protocol.ts`, `secureChannel.ts` and `remoteContent.ts` are deleted; `SessionSync.ts` and
  `remoteContent.ts` are rewritten on the package types.
- Frontend changes are confined to the pairing screens (v2 QR, verification code, capability
  choice, waiting for approval) and to the controller mapping in `features/chat/remote`.

## Persistence

| Store | Content |
| --- | --- |
| `desktop_connection` (migrated) | `id` = desktop-assigned `deviceId`, `name`, `addresses[]`, `port`, `desktopIdentity`, `grants` (`{ domain, grantId }[]`), `status`, `lastFetchedAt`; drops `baseUrls`, `activeBaseUrl`, `desktopVersion`. The migration recreates the table and drops HTTP-era rows, which can no longer connect. |
| SecureStore | `remote-device-identity` (private key protobuf, hex). HTTP-era `desktop-connection-token.*` entries are simply no longer read. |
| `remote_session_projection` (new) | `connectionId`, `grantId`, `sessionId`, `streamEpoch`, `seq`, `projection` JSON, `updatedAt`. Written in one transaction with each applied batch, before the ACK. |
| `remote_agent_command` (PR #997 journal) | Unchanged: `commandId`, method, params, connection + grant, status, receipt. |

Access tokens are never persisted. History pages, parts and content live in TanStack Query with
keys including `connectionId` and `grantId`; a new grant (re-pair) invalidates everything.

## Flows

**Pair.** Scan → validate the v2 payload → user picks capabilities (both on by default) → open a
session against the pinned identity without authenticating → `pairing.claim` → show the returned
six-digit code and "approve on your desktop" → poll `pairing.get` every two seconds until
`approved` / `rejected` / `expired` (invitation life) → on approval store the connection with its
grants, keep the session authenticated, and if `configuration` was granted run the existing
preview/import immediately. Re-pairing an existing desktop replaces its grants and identity binding.

**Configuration import.** `configuration.export.prepare` → `configuration.export.read` in 24 KiB
pages until `eof` → verify `byteLength` and `sha256` → parse with the existing
`DesktopProvidersSnapshotSchema` (payload `version: 1` is unchanged) → existing
`DesktopConnectionService.preview/import`. The export is pinned five minutes on the desktop.

**Agent session.** `agent.sessions.subscribe` with the stored cursor when one exists. `replay`:
activate at that cursor and apply events. `checkpoint`: read every page, `installAgentCheckpoint`,
persist projection + cursor, then `agent.subscriptions.activate`. Each `agent.events` batch goes
through `applyAgentEvents`; on success the projection and cursor are committed together and
acknowledged; on `gap`/`epoch`/`revision`/`content` the subscription is closed and re-prepared
without a cursor. `agent.subscriptions.resetRequired` does the same. Live parts that arrive as
content refs are fetched with `agent.content.read` at the given revision before the batch is
applied; the checkpoint lease covers those reads. History is read at the projection's
`historyRevision` (`messages.list`, `parts.list`); `REVISION_EXPIRED` restarts that traversal at
the current revision without touching the live overlay. `history.committed` invalidates the
history queries; `message.removed` after it releases the live message.

**Commands.** `RemoteAgentCommandJournal` persists `commandId` + params before sending, exactly as in
PR #997. `messages.send` carries `expectedIdleRevision` from the projection's session; `CONFLICT`
restores the draft. `executions.cancel` carries the active execution id. `interactions.respond`
carries `expectedRevision`, `expectedExecutionId` and `inputDigest` from the interaction it shows.
A lost response is recovered with `agent.commands.get` and, when absent, by resending the same
`commandId`; `IDEMPOTENCY_CONFLICT` and `interrupted` stop recovery and surface to the user.

**Revocation and repair.** `GRANT_REVOKED`, `UNAUTHENTICATED` on authenticate, or a failed identity
pin mark the connection `needs-repair`; the drawer hides its agents and the settings row offers
re-pairing. Configuration and Agent grants are independent: a desktop can revoke one and keep the
other, and the UI gates each feature on the grant it needs.

## App lifecycle

- No session is opened by lifecycle phases. Sessions open when a screen needs one (sync preview,
  remote chat source) and close after the last consumer releases them plus a short grace.
- Background: the session is suspended and subscriptions closed; the persisted cursor is the resume
  point. Foreground: reconnect, re-authenticate, `subscribe` with the cursor. Neither path cancels
  desktop execution.
- One session per desktop; the Agent adapter and the configuration importer share it.

## Slices

| Slice | Delivers | Proof |
| --- | --- | --- |
| 1. Transport spike | protocol + transport packages mirrored, RN socket adapter, `deviceIdentity` | Development client on a device completes the Noise handshake and `connection.ping` against a desktop dev build; package tests pass under the mobile toolchain |
| 2. Pairing | v2 QR, capability choice, claim/poll UI, `desktop_connection` migration, identity in SecureStore | Pair, reject, expire and re-pair against the desktop; old rows show `needs-repair` |
| 3. Configuration sync | export.prepare/read, existing preview/import | Import matches the HTTP-era result on the same desktop; `FORBIDDEN` without the grant |
| 4. Agent read path | `SessionSync`, projection table, history/parts/content reads | Checkpoint install, live text/tool events, reconnect replay and forced reset, all reduced by the package reducer; desktop test fixtures replayed in Jest |
| 5. Agent commands | send/cancel/respond over the journal, `commands.get` recovery | Duplicate `commandId` returns the receipt; changed body conflicts; idle-revision conflict restores the draft |
| 6. Lifecycle and acceptance | background/foreground, revocation, multiple desktops, device acceptance per `docs/guides/parallel-device-testing.md` | iOS and Android acceptance with a paired desktop; screenshots on the PR |

Slices 1–3 replace what `main` ships and are releasable on their own; 4–6 land the PR #997 scope.

## Out of scope

Relay service, file bytes for `file` parts (desktop exposes metadata only), approval cards that the
desktop persists after a turn (listed and answerable, not streamed), and any write to desktop
Agents or workspaces.
