# Send mobile files to desktop

Status: implemented locally in the paired desktop and mobile workspaces; native acceptance and
shared-package publication are pending. The design below
records the original baseline; the implementation decisions in this section supersede its open
questions and small-file assumptions.

## Implementation decisions (2026-10-08)

- Remote Agent composer supports camera, photos and managed files, including a file-only first
  message. Older desktops retain text-only input. Upload starts on Send, with progress and cancel.
- The shared package owns prepare/get/resume/write/complete/cancel and `agentUploadsVersion: 1`.
  Limits are 1 GiB/file, 2 GiB/message, eight files, 24 KiB chunks and a window of eight requests.
- Both upload identity and the takeover request survive phone restarts in the command journal.
  Desktop checkpoints survive restart; resume uses its durable offset and fences old writers.
  A local source is hashed again on recovery to reject changed bytes. No entire file enters JS memory.
- Before send, an expired staging record can be uploaded again. Once send parameters are frozen,
  receipt recovery uses the exact command ID and upload references. It never silently creates a
  second Agent execution. Cancellation is recorded in the command journal before aborting work or
  cleaning up remote staging, and remains available while an upload waits for reconnection. Once
  send parameters are frozen, upload cancellation cannot retract an uncertain submitted message.
  Unreachable/closed connections remain retryable, including failures between chunk requests.
  Terminal failure retains local references for retry or edit; editing restores text and available
  attachments and reports missing files individually.
- Desktop staging retains data for 24 hours idle, at most seven days. Device/global staging
  reservations are 4/8 GiB. Shutdown drains work and preserves staging; cancellation, revocation
  and expiry reclaim it. Accepted messages keep FileManager originals independently.
- Verified originals become managed message entries on send. Agent tools receive a separate copy
  inside the chosen session workspace, following the channel's workspace ownership model.
  Workspace edits cannot change historical download bytes.
- Tapping an attachment downloads bounded content pages, checks the digest, and exposes image
  preview or the system share/save sheet. Merely opening history never downloads large files.
  Completed downloads reuse a verified OS-cache file keyed by pairing identity/grant, session,
  attachment revision and digest. Concurrent consumers share the transfer and cancel independently;
  the last consumer leaving aborts incomplete work. Only verified bytes are promoted to the reusable
  file. Missing cache files are downloaded again. Interrupted downloads currently restart from zero.
  Cache capacity limits and a user-facing clear action remain follow-up work.
  Upload resumption is independent of this readback policy.
- iOS suspension can pause JavaScript transfer. Foreground/relaunch recovery resumes uploaded
  bytes; continuous background transfer is not promised. Network changes must reach the paired PC
  directly (LAN/company/VPN); there is no cloud relay or offline desktop inbox.
- The portable tarball under `vendor/` is generated from the desktop shared package for this
  unpublished cross-repository change. Replace it with the Changesets npm release before release.

Validation is recorded by the implementing change. Filesystem/Jest tests do not establish native
picker behavior, real network throughput or OS background survival.


See [Remote Access](./README.md) for the current connection contract and
[Service Dependencies And Ownership](./service-ownership.md) for existing lifecycle boundaries.

## Product scope

First scope: attach files to a desktop Agent conversation from the mobile composer.
Support an existing conversation and the first message that creates a new conversation, including
a message containing files without text. The separate device-page transfer entry remains an open
product choice.

## Inspected pre-change baseline

Inspected on 2026-10-08. Desktop evidence comes from CherryHQ/cherry-studio commit
`26d8e984f66a1ad2bb41d96d556f5ef01f29111d`; package versions below describe the pre-change mobile
dependency baseline, not future release requirements.

- The pre-change mobile app used `@cherrystudio/remote-protocol@0.3.0` and
  `@cherrystudio/remote-transport@0.1.2` from npm.
- Shared `agent.messages.send` accepts only text, a command ID, a session ID, and an idle revision.
  There is no upload method in the published Agent method map or desktop main's method map.
- Mobile `RemoteComposer.tsx` explicitly uses text-only input and its adapter rejects file parts.
- Desktop `remoteAccess/agentHandlers.ts` passes text to `SessionJournal.startRun`, which constructs
  a single text message part. Desktop `FileManager` already supports creating managed entries.
- The encrypted remote connection caps each application record at 64 KiB. Files require bounded
  chunks; an entire file must not be encoded into `text` or one JSON-RPC record.

## Shared protocol and desktop changes

1. Add a negotiated file-upload capability in the shared protocol. Mobile enables attachments only
   when the connected desktop advertises it. This is a protocol feature advertisement under the
   existing Agent grant, not a new authorization domain. Older peers keep working for text messages.
2. Define upload preparation, chunk writing, completion, and cancellation in the shared package.
   Preparation binds an upload ID to device/grant, filename, media type, byte length, and SHA-256.
   Specify size, file-count, chunk, concurrent-upload, and retention limits in the package.
3. Bind every upload operation to the authenticated Agent grant. The desktop chooses temporary
   paths; a client-supplied name never becomes an arbitrary filesystem destination.
4. Retry chunks by upload ID and offset. Identical repeats are accepted, differing repeats rejected.
   Preparation and completion must also be idempotent after a lost reply. Completion verifies byte
   count and digest before importing into desktop managed storage. A bounded raw chunk such as
   24 KiB leaves room for base64 and JSON overhead inside a 64 KiB record; the final limit belongs
   in the shared contract and must be tested against the fully encoded request.
5. Extend message send with completed-upload references and allow file-only input. Resolve
   references under the sending device/grant, then construct desktop message file parts and use
   existing message/file ownership. Preserve command receipts and the idle-revision check.
6. Bound abandoned-upload lifetime and release temporary bytes on cancellation, expiry, grant
   revocation. Service shutdown preserves resumable uploads. Do not delete files retained by accepted messages.

The upload reference is opaque and scoped to its device/grant. It must not accept an arbitrary
desktop file-entry ID or path. The send handler resolves it into managed message file parts;
model-specific file parsing remains with the existing desktop Agent pipeline. Upload completion
means the desktop has verified the bytes; message admission and Agent execution have separate
outcomes.

## Mobile changes

1. Consume the matching shared package version, without introducing a private RPC schema.
2. Use existing document/image picking and managed composer attachments. Read actual managed file
   bytes through backend file ownership, with bounded chunks and cancellation between requests.
3. Keep upload preparation inside the existing Agent scope's retained-work lifecycle. Capture
   stable local file references and completed desktop upload references for retries.
4. Update shared remote input, first-send orchestration, journal projections, and undelivered input
   together. Persist exact admitted command parameters; a lost receipt must recover the same
   command, never start another Agent turn.
5. Restore text and attachments after an unadmitted failure. Preserve both in retry/edit actions
   after a recorded rejection. Report unsupported desktop versions before consuming the input.
6. Add progress/error presentation using CherryUI and translate changed copy into all 13 locales.

Do not persist file bytes, base64 payloads, or temporary picker URIs in the command journal. Use
managed mobile file references and ensure cleanup cannot remove bytes still needed by pending work.
Freeze the prepared desktop references with the command ID before message submission. Check
`agent.commands.get` before recovering an uncertain send; an expired upload must never cause a
fresh command while the old command's outcome is unknown.

For the initial implementation, a disconnect before message admission may require re-uploading the
file, while retaining its local attachment. Cross-process resumable uploads are a separate choice;
the protocol must explicitly report lost/expired upload state. Route disposal must follow the
existing retained-work policy, and user cancellation must stop pending chunk work.

## Ownership and implementation order

| Stage | Owner and affected boundary | Exit condition |
| --- | --- | --- |
| 1. Contract | Desktop repository `packages/remote-protocol`: Agent methods and connection feature negotiation | Schemas, limits, errors, idempotency, and old-peer compatibility have focused tests |
| 2. Receiver | Desktop `remoteAccess` handlers and lifecycle; existing `FileManager` and Agent message persistence | Verified original bytes become owned message attachments; abandoned uploads are reclaimed |
| 3. Mobile backend | `RemoteAgentScope`, `RemoteAgentActions`, shared remote input/views, and bootstrap file-access injection | First send and existing-session send preserve files across rejection and uncertain outcomes |
| 4. Mobile UI | Remote conversation adapters, `RemoteComposer`, and `UndeliveredMessageRow` | File selection, progress, cancellation, retry, and edit preserve complete input |
| 5. Release and acceptance | Shared package publication, desktop feature availability, mobile dependency update | Matching released artifacts pass paired-device checks; older desktops retain text behavior |

Mobile should consume the published shared contract. Do not ship a private mobile RPC schema or a
dependency on another developer's local desktop checkout. Implementation stages describe dependency
order, not a decision to create stacked pull requests.

## Open product and contract decisions

- Confirm the Agent conversation entry point; decide whether standalone transfer to the desktop
  file library is a later feature with its own authorization and completion semantics.
- Set allowed file types, per-file and per-message byte limits, attachment count, concurrent upload
  limits, and upload expiration. Validate actual byte counts rather than trusting picker metadata.
- Decide whether the first version needs resumable uploads after process death. Uncertain message
  receipt recovery is required regardless of this decision.
- Agree on shared RPC names and error codes, capability advertisement, target package version, and
  minimum desktop release before implementation.

## Verification required

- Shared schema compatibility, file-only messages, bounded record sizes, and declared limits.
- Desktop cross-device/grant isolation; malformed, duplicate, reordered, truncated, oversized, and
  hash-mismatched uploads; cleanup and completed-upload replay; file/message references.
- Mobile existing-session and first-send workflows; disconnect during upload or after command
  admission; journal reload; no duplicate sends; retry/edit retains every file.
- Focused suites, complete mobile `pnpm typecheck`, changed-file lint/format, and i18n validation.
- Paired desktop and custom mobile development-client acceptance: text file, image, binary file,
  file-only send, multiple files, cancellation, reconnect, and light/dark composer behavior.

## Delivery order

When implementation is scheduled, implement and validate the shared protocol and desktop receiver
in an isolated desktop checkout, consume the released shared package in mobile, and run
interoperability checks. The mobile repository alone cannot deliver working file transmission
against the inspected desktop contract. Remove any temporary integration artifacts after the
matching shared package is available; do not keep a second protocol definition in mobile.
