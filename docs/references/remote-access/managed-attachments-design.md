# Managed attachment drafts — mobile integration plan

Status: **implementation integrated; acceptance in progress**, 2026-10-10. Design baseline `cb439748a`.
The earlier upload-on-Send implementation is documented in [File Transfer](./file-transfer.md).

The cross-client design is owned by the desktop repository at
`docs/references/file/managed-attachments-design.md`, tracked with
[desktop PR #21399](https://github.com/CherryHQ/cherry-studio/pull/21399).
It covers FileIntakeService, FileManager publication, draft/message reference ownership,
native harness file access, crash recovery, wire methods and acceptance. This companion records
mobile-specific integration; it does not define a second protocol or copy the desktop state machine.
The design documents are local until their documentation changes are published.

## Target interaction

```mermaid
sequenceDiagram
    participant UI as Composer
    participant Tasks as RemoteAgentScope draft tasks
    participant PC as Desktop intake and drafts
    UI->>Tasks: Select attachment with stable identity
    Tasks->>Tasks: Persist local intent
    Tasks->>PC: Ensure session, open attachment draft
    PC-->>PC: Display pending user-message block
    Tasks->>Tasks: Resolve source and compute digest
    Tasks->>PC: Resume, send bounded chunks, complete
    PC-->>Tasks: Durable progress, then managed file ready
    Tasks-->>UI: All attachments ready; Send may be enabled
    UI->>Tasks: Explicit Send
    Tasks->>PC: Send immutable command with draft revision
    PC-->>Tasks: Receipt and committed message association
```

The tile starts loading immediately after selection. Desktop visibility begins when draft metadata
arrives, before the full-file digest pass. Offline selection cannot appear on an unreachable PC.
Uploading does not submit text or start the Agent. A ready draft waits for explicit Send.

## Ownership and dependencies

| Owner | Planned responsibility |
| --- | --- |
| `RemoteAgentRuntime` | Retain scopes with unfinished draft work independently of routes |
| `RemoteAgentScope` | Draft task lifecycle, cancel intent, progress, upload/receipt recovery |
| Draft journal within `remoteAgent` | Local file refs, stable owner binding, task identities, manifest and cancel state |
| `RemoteAgentActions` | Immutable admitted command params and receipts; no longer owns starting uploads on Send |
| `DesktopConnectionManager` | Existing connection demand, AppState, endpoint choice and reconnect |
| `remoteUploads.ts` | Bounded byte transfer through injected file/request ports; per-file progress |
| `appShell/conversation/remote` | Credential-free snapshots, bound commands, resource and pending-row projection |
| Composer and message adapters | Map local/remote resources to the same attachment presentation |
| CherryUI file-preview | Pure preview frame, border progress, metadata-only state, accessibility |

Bootstrap injects dependencies through the existing backend composition. Do not resolve a new
service host from a late callback. Stop owners before releasing their connection/file dependencies;
await tracked tasks. A route release unsubscribes, while explicit removal/cancel persists intent
before aborting or scheduling best-effort remote cleanup.

Local source file refs require durable retention for the draft lifetime, including across process
restart. Audit the file module's existing retention contract before changing automatic deletion;
do not assume a component-held URI keeps a file alive. Missing/deleted files are reported per item.
The phone stores draft intents and command recovery, not a second SQLite copy of remote history.

## Contracts and race handling

- Consume the new draft capability and schemas from the desktop-owned shared package. Existing
  `agentUploadsVersion: 1` is not sufficient to enable the new flow. Published package integration
  is a release dependency; do not introduce copied schemas or absolute workspace dependencies.
- Draft identity is scoped by paired desktop identity, device, grant and session. Local attachment
  identity is independent of the filename and upload attempt. Target changes create a new draft;
  late callbacks check binding, task generation and attachment membership before saving.
- Separate manifest revision from progress sequence. Progress cannot invalidate an otherwise
  unchanged send manifest. Stream epoch changes install a fresh snapshot using the existing
  subscription/checkpoint activation protocol, avoiding a get-then-listen race.
- Resume with stable upload/resume identities and the desktop's durable offset. Keep SHA-256
  source validation and writer fencing; do not load a large file wholly into JS memory.
- Treat connection failures as retryable, including readiness failures before a chunk request.
  OS suspension is a pause, not guaranteed background execution. Recovery is runtime-owned.
- Cancel is journaled before abort/cleanup. A late successful complete cannot reattach a removed
  item. Once a send is admitted/uncertain, cancellation is no longer upload cancellation.
- On Send, atomically hand the selected manifest to the command journal, then clear that composer
  generation. Never interpret the normal Composer clear-on-Send as user removal. A newer draft
  must not be overwritten when an earlier operation fails.
- Receipt recovery precedes draft/upload lookup and never changes a frozen command body. A true
  rejection may return content to an undelivered action; edit restores available files and text,
  reporting missing items. A submitted draft is associated with its actual message identity.
- First attachment in a new conversation is proposed to create an empty desktop session using the
  existing idempotent create command. This changes when an empty session appears; the desktop
  design records it as a product decision. Cancelling a draft does not silently delete the session.

## React and component changes

Selection/paste/camera completion invokes an explicit Composer action that registers a draft task.
Do not watch the attachment array in an effect to start or cancel transfers. Task recovery belongs
to backend startup/reconnect, and component cleanup only releases observation.

Use the existing source subscription adapter; if adapting an external store, keep immutable cached
snapshots and stable subscriptions as required by
[useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore).
Derive `canSend` from content, target availability, submission state and all files being ready;
do not synchronize another boolean through an effect. User-triggered mutations stay in actions,
following [React's effect guidance](https://react.dev/learn/you-might-not-need-an-effect).
[StrictMode](https://react.dev/reference/react/StrictMode) remounts must not duplicate transfers.

Each attachment tile observes only its transfer state; the Send control observes readiness.
Coalesce progress updates at the task boundary, emit terminal states immediately, and keep byte
buffers outside React and query caches. Stable attachment keys preserve previews while progress
changes. Use existing native motion primitives for border animation, not frame-by-frame setState.

The common visual is CherryUI `FilePreview` with `variant="attachment"`, currently used by
`FileEntryPreview` in the composer. Extend its neutral frame with progress and metadata-only
support, then use it for remote message attachments too. Do not fake a URI or FileEntry to reuse it.
Do not automatically download gigabyte attachments for thumbnails. Sender-local verified files
can supply the preview; other devices show the same metadata tile until bytes are requested.
Opening/downloading/sharing remain business-adapter operations; the UI package receives props.

Loading states distinguish import/hash preparation, acknowledged transfer, verification/publication,
paused and failed. At 100% bytes the file may still be verifying, so Send stays disabled. Per-item
failure blocks the full message until retry or explicit removal. All new strings follow i18n rules;
the progress border also exposes accessible state and respects reduced motion.

## Implementation and acceptance

1. Desktop file intake and durable managed publication; validate bytes, checkpoints and cleanup races.
2. Desktop draft protocol and source package publication; add mobile consumed-contract tests.
3. Move mobile pre-send uploads into durable draft tasks; test cancel/restart/target change and handoff.
4. Unify tiles and add per-file progress; test selectors/actions and perform actual device acceptance.
5. Verify first-session creation, desktop pending projection and history association together.

Keep the existing upload-on-Send decoder only for persisted commands/older supported peers during
migration. Define retirement against the desktop release and journal retention; never reinterpret
an old uncertain command with new references. Keep one active task owner rather than two upload
loops behind separate UI states.

Meaningful acceptance includes bytes after a mid-file restart, no second message after a lost
receipt, durable cancellation with cleanup pending, source deletion, hash mismatch, first file-only
message, simultaneous same-name files, UI detach/reattach, StrictMode, history/event arrival in either
order, and Android/iOS background/foreground plus VPN transitions. Measure memory, throughput and
main-thread responsiveness for 1 GiB; unit tests alone cannot establish native acceptance.

Agents continue using the harness's native read/edit/write/bash against ordinary file paths.
No dedicated attachment read/patch tools are introduced. The desktop host owns path allocation,
change observation, metadata reconciliation and publishing stable result snapshots. The mobile
preview/resource path consumes published files, not in-progress mutable bytes with a stale digest.
It never receives the desktop's physical storage path or writes desktop FileEntry rows directly.

Preserving original message attachments while allowing native editing requires separate content
states. The host chooses snapshot/clone/copy mechanics; the Agent does not perform a mandatory
export-edit-import tool sequence. FileManager API locks do not constrain native bash writes, so
watcher notifications are invalidation hints and publication must verify a stable snapshot.

## Implemented mapping

`RemoteAttachmentDrafts` owns persisted intents, bounded upload/recovery, manifest CAS and cancellation.
Composer attachment actions register changes; silent clear-on-Send does not remove a server draft.
The action journal is authoritative after admission, including across the crash gap between journaling
and retiring the preparation task. An explicit resend may prepare a fresh draft; recovery of an
uncertain command always preserves its recorded body. Reopening a conversation restores unsent
managed references, while missing local sources are reported.

The first attachment creates an empty desktop session. Workspace selection is disabled while files
are attached; remove them before changing the target. Imports belong to My Files and retain their
existing manual retention policy. Draft disposal never deletes those source files.

Progress is coalesced at 100ms with immediate terminal updates. The current implementation uses
upload responses and draft get for recovery, without introducing another remote event stream.
Desktop renderer subscribes to invalidation before reading snapshots. It keeps a dirty flag during
an in-flight read. Manifest revisions remain independent of progress.

The shared `FilePreview` frame draws the transfer border; importing tiles and remote message metadata
use the same attachment variant. Ready requires desktop verification/publication, not 100% bytes.
The existing progress/cancel row remains only for recovery of older persisted send-time uploads.

The portable `vendor/cherrystudio-remote-protocol-0.4.0-attachments.3.tgz` is built from the desktop
protocol source. It is unpublished. Replace it through the normal shared-package release workflow.
Automated checks and Android/iOS native acceptance are reported separately; no 1 GiB performance
or background-execution guarantee follows from unit tests.
