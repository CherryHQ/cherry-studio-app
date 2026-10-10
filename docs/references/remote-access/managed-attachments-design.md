# Managed attachments — checkpoint-based desktop integration

Status: **simplification integrated; acceptance in progress**, 2026-10-10.
Desktop attachment-draft/intake tables, DB services and their unpublished development migrations
have been removed. New sends use direct references and desktop presence is disposable.
[File Transfer](./file-transfer.md) records the implemented transport and historical decisions.

The authoritative cross-client design is in the desktop repository at
`docs/references/file/managed-attachments-design.md`, tracked by
[desktop PR #21399](https://github.com/CherryHQ/cherry-studio/pull/21399).
Mobile work is tracked by [PR #1190](https://github.com/CherryHQ/cherry-studio-app/pull/1190).
Consume its shared protocol package; do not introduce mobile-private wire schemas.

## One owner for each fact

| Fact | Authority |
|---|---|
| Unsent text and selected attachments | Persistent mobile draft |
| Received bytes, durable offset, publication and temporary retention | Desktop file module and filesystem checkpoint |
| Submitted message and execution association | Desktop message/command system in its existing SQLite database |
| Desktop pending user-message block | Disposable projection of mobile selection and desktop upload progress |

Desktop does not edit the phone's draft. It does not need a durable draft revision, claim, consume
or release state machine. After desktop restart while the phone is offline, pending presentation
may disappear until reconnection. Upload bytes and checkpoints remain recoverable independently.

Both desktop `attachment_draft` and `file_intake`, including their dedicated reference tables,
have been removed. Normal FileEntry, message references and command records remain.
Desktop checkpoints now own publication identity and retention, with a recovery barrier before
automatic cleanup. Source-copy reduction on mobile remains separate pending work.

## Selection, upload and send

```mermaid
sequenceDiagram
    participant UI as Composer
    participant Task as Mobile draft/task owner
    participant Files as Desktop file module
    participant Chat as Desktop messages
    UI->>Task: Select attachment
    Task->>Task: Persist selection and source ownership
    Task->>Files: Prepare upload; publish disposable selection metadata
    Files-->>UI: Desktop can show pending progress
    Task->>Task: Prepare stable source if needed
    Task->>Files: Resume, binary DATA, complete
    Files-->>Task: Durable offsets, then ready
    Task-->>UI: All selected files ready; enable Send
    UI->>Task: Explicit Send
    Task->>Task: Persist immutable command and transfer source retention
    Task->>Chat: commandId + text + explicit upload refs
    Chat->>Files: Validate and protect ready files
    Chat->>Chat: Transaction: message, file refs, command/execution association
    Chat-->>Task: Existing command result
```

The diagram groups desktop presentation with the file endpoint for brevity; authentication and
selection projection remain Remote adapter responsibilities. File intake does not own chat UI.
Loading starts when selection is accepted, including local preparation. An offline phone cannot
make its selection appear on an unreachable desktop. Upload completion never starts the Agent.

Send freezes this intent rather than a pointer to a desktop draft revision:

```ts
agent.messages.send({
  commandId,
  sessionId,
  expectedIdleRevision,
  text,
  attachments: [{ uploadId }]
})
```

Receipt recovery precedes upload lookup. Once a command might have reached the desktop, retry
with the same ID and body, even after upload expiry. Clearing the composer or removing a newer
attachment is not message recall. A definitive rejection permits an explicit new attempt.

Handoff persists the frozen command before retiring its preparation task. Startup reconciles
both journals so a crash between these steps neither loses source ownership nor starts another
send. Desktop establishes normal message references before releasing temporary protection.
The final Agent result still follows the existing execution journal; external tools are not replayed
merely to repair bookkeeping.

## Local source retention and large files

The uploader needs stable, reopenable bytes, not necessarily a full copy in app data.
Current document selection can copy into picker cache and then into `Data/Files`; imported files
use My Files' manual retention. Current uploads reuse imported originals and create a persisted
snapshot for mutable/generated content. Reducing these copies is **pending work**.

- Prefer direct reading only when durable permissions, restart reopening and unchanged content
  are guaranteed. A URI or unchanged size alone does not establish those properties.
- Otherwise keep one necessary stable snapshot. An app-owned picker cache file may be moved or
  adopted when ownership and filesystem boundaries permit. Cross-filesystem adoption may require
  copying first and removing the app-owned temporary source after successful publication.
- Never move or delete a user's external original. Do not simply disable picker cache copying
  before the native reader and persisted URI permission contract support it.
- Drafts/tasks retain temporary sources. Admitted or uncertain commands retain them after the
  composer clears, until terminal resolution no longer needs them. User-saved files keep their
  existing retention policy; draft disposal is not permission to delete them.
- Missing or changed source bytes fail explicitly; do not resume an old upload using a replacement.
  Source preparation time and storage costs must be measured separately from network transfer.

The implemented transport uses 1 MiB binary blocks, a window of two, and bounded encrypted frames.
There is no mobile whole-file SHA-256 pre-scan or per-block business digest. Desktop computes the
final hash before publication. This is not an independent checksum comparison against the phone's
original; stable source ownership is still required. Keep byte buffers outside React/query caches.

Limits remain 1 GiB/file, 2 GiB/message, eight files, 24-hour idle retention, seven-day lifetime,
and 4/8 GiB per-device/global desktop staging reservations. Ready unsent uploads still count.
Selection presence does not renew retention indefinitely. Native OS background upload is a separate
capability; this work supports pause and foreground/relaunch recovery, not continuous JS execution.

## Disposable desktop selection

Send full selection snapshots on change and reconnect, with a display identity, session, sequence,
attachment identities, names/sizes and upload IDs when available. The desktop binds them to the
current authenticated connection generation and owner; old generations/sequences cannot replace
newer state. These are presentation updates, not durable mutation commands or draft CAS.

Upload progress/readiness comes from the desktop file module. Empty selection removes the view.
A command ID associates the pending block with the eventual formal message; committed commands
suppress delayed selection updates. History-first and ACK-first delivery must both show one user
message. No desktop physical path or arbitrary FileEntry ID becomes a client authority.

The shared method is `agent.attachments.present`; `selectionId` in send is presentation correlation,
not a content lookup. Keep the existing
connection/IPC notification infrastructure rather than introducing a second subscription protocol.
First attachment currently creates an empty desktop session through the idempotent create command;
retain that behavior for this refactor. Cancellation does not delete the session or run the Agent.
Target changes cannot silently carry tasks to another grant/session.

## Runtime, functions and interfaces

| Existing module | Target change |
|---|---|
| `RemoteAgentRuntime` | Retain scopes with unfinished tasks independently of routes |
| `RemoteAgentScope` | Coordinate selection actions, connection demand, task/receipt recovery and presence |
| `RemoteAttachmentDrafts` | Keep mobile selection and source ownership; remove desktop manifest CAS/claim synchronization |
| `RemoteAgentActions` | Freeze explicit upload refs; preserve immutable admitted bodies and terminal/uncertain semantics |
| `remoteUploads.ts` | Preserve bounded native binary upload, persisted resume identity and writer fencing |
| `DesktopConnectionManager` | Keep existing endpoint choice, AppState and reconnect ownership |
| `shared/contracts/remoteAgent` | Expose credential-free stable task/progress snapshots and explicit actions |
| `appShell/conversation/remote` | Adapt readiness, send handoff, undelivered restoration and local preview resources |
| Composer / file-preview adapters | Use the same attachment visual and alignment for composer and messages |

Bootstrap injects dependencies; late callbacks do not discover a new service host. Shutdown stops
owners and awaits tracked work before closing file/connection dependencies. Avoid introducing a
generic lease framework or duplicating the desktop history database on the phone.

Removal persists local intent before abort/remote cleanup. Callbacks check attachment ID, binding
and generation; a late complete cannot reattach a removed item. Cancellation and send are distinct:
a desktop send that already protected the files may complete, while an earlier cancellation causes
send validation to reject. Uncertain commands remain owned by command recovery.

## React and presentation

Network mutations start in explicit selection/remove/cancel/send actions, not effects observing the
attachment array. Component unmount only unsubscribes. Normal clear-on-Send is an explicit handoff,
not removal. Late failure restoration cannot overwrite a newer draft.

Use cached immutable snapshots and stable subscriptions through the existing external-store
adapter. Derive `canSend` from content, target availability, submission state and all files ready.
Each tile observes its own progress; coalesce updates around 100 ms and emit terminal states
immediately. Stable attachment keys and task ownership prevent StrictMode remount duplication.

Composer and messages share CherryUI `FilePreview` attachment presentation. User attachments align
right and wrap; business adapters supply local resources or remote metadata without fake URIs.
Border loading covers source preparation, transfer and final desktop verification. 100% bytes does
not enable Send until ready. Source images can supply thumbnails when tied to the sent content;
opening history must not eagerly download gigabyte files for previews. Other devices use metadata
until content is requested. New copy follows i18n and accessible progress conventions.

## Errors and acceptance

| Case | Required result |
|---|---|
| Disconnect or lost ACK | Resume from desktop durable offset; fence old writers |
| Source lost or changed | Fail the item; do not splice replacement bytes into the upload |
| Cancel while offline | Persist cancellation, then retry cleanup; late callbacks cannot restore selection |
| Desktop restarted with phone offline | Upload survives; pending presentation may be absent |
| Old presence after reconnect or history | Ignore stale generation/sequence or committed command association |
| Send response lost after staging expiry | Return original command result without reupload or another execution |
| One selected file fails | Block send until explicit retry/removal; never silently omit that file |
| Auth revoked or target deleted | Stop new operations; do not move tasks to a different grant |
| Storage/quota failure | Preserve valid recovery state and surface actionable failure |

Desktop acceptance must prove fixed-ID publication through crashes, checkpoint recovery before
cleanup, unreadable-checkpoint safety, and protection during message transactions. Mobile tests
must prove persistent source retention, immutable command handoff, cancellation races and restart
recovery with actual bytes. UI checks cover pending/history order, consistent previews, right
alignment, remounts and route changes.

Android small-file transfer has been exercised: one 2,145,653-byte upload function took about
1.20 seconds, including roughly 171 ms preparation inside that function. This excludes the picker
and initial managed import. It does not establish 1 GiB memory/disk/throughput, iOS behavior or
OS-background acceptance. Measure preparation, transfer and publication independently on devices.

## Migration and native Agent boundary

Coordinate the desktop file protection change before removing mobile draft protocol dependencies.
Inspect persisted commands and real release status first: never rewrite an uncertain old command
into a different request body. A bounded recovery decoder or one-time migration is justified only
by actual persisted work, not by a desire to version every unpublished iteration.

Use one shared source and portable development artifacts; no absolute workspace dependencies or
copied schemas. Normal shared-package publication remains a release step. The removed tables belonged to unpublished development migrations; those SQL/snapshot files were
removed outright. The local desktop development DB was backed up and cleaned separately. Other
released migrations and normal message/file/command data remain unchanged.

Agent tools remain native read/edit/write/bash against ordinary authorized paths. Historical bytes
and mutable working bytes stay separate through host-managed snapshots/clone/copy. The current
workspace copy is not a second permanent upload store. This simplification introduces no dedicated
attachment editor, general VFS, automatic bash replay or arbitrary-script artifact watcher.
