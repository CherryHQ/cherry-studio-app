# SSH connections

SSH is a local connection capability separate from Cherry desktop pairing. The Plugins page owns
saved SSH connections, with routes and page implementations beneath `plugins/ssh` and
`frontend/features/plugin/ssh`. Adding or opening a connection uses the same form with a fixed
save footer. Its menu owns enable/disable, remote files, opening an Agent draft, and deletion;
host verification stays next to the saved fingerprint. Unchanged forms cannot be saved.
Remote files reuse the library's CherryUI `FileBrowserRow` and `Breadcrumbs` presentation, including
folder/file artwork, filename truncation, secondary metadata and row dividers. Header back moves up
one directory; breadcrumbs jump to ancestors. Refresh and upload use the standard header menu.
The upload chooser uses the same rows while retaining destination and overwrite confirmation.
Opening an Agent draft reuses the shared `AgentPickerSheet` with standard Agents only; target
selection stays in the profile owner so closing the choice sheet cannot cancel the handoff.
The chat composer's plus menu opens an anchored server picker and inserts the selected server as
an inline mention. That picker only selects servers. Opening a draft or selecting a target does
not send a message or run a command. There is no standalone command panel.
Sent messages retain the mention's label and UTF-16 text offset so it keeps the composer's link
color after loading history, editing, or retrying. This display snapshot carries no connection
identity, credentials, or command grant; live target selection still owns execution. Older messages
stored only as plain text have no SSH display snapshot to restore.

## Owners

- `modules/ssh` owns libssh2 and the iOS/Android bridges; see its
  [native contract and source pin](../../modules/ssh/README.md).
- `SshProfileService` owns durable profile configuration in a dedicated MMKV store under the
  active storage generation's `ssh/` directory, separate from disposable caches. `/ssh-profiles`
  exposes only metadata. A profile revision changes on every edit and trust decision.
- `SshRuntime` owns device-only SecureStore credentials, host-probe tokens, operation admission,
  conversation targets, temporary grants, authentication challenges, file-transfer lifetimes,
  native pool maintenance, cancellation and draining before database shutdown.
  Its lifecycle dependencies are `DbService` (for managed-file operations) and
  `KeepAliveCoordinator`; Agent host dependencies
  keep it alive until Agent turns have drained.
- `Backend.ssh` exposes user workflows. Frontend hooks read metadata through Data API and observe
  the runtime's target-selection source. Screens do not access native sessions or stored secrets.
  The app-shell `ssh` presenter displays authentication questions and sends answers directly to the
  runtime; neither prompts nor answers become model inputs or transcript parts.
- `ssh_execute` and the five SSH file tools are the AI consumers. Each turn captures the selection identity, connection revision
  and grant. Reselecting the same connection cannot revive an old pending approval.
  Connection identity and revision are backend-bound, not model-supplied. Invalid parameters return
  structured `invalid-input` results. Execution checks the live binding again after loading credentials.
  Model output previews retain the head and tail within 16,000 characters per stream or file content;
  native diagnostics remain available to users but are excluded from model results. Remote output is untrusted data, never a source of permissions.

## Commands and remote files

`remoteDirectory` belongs to a connection profile. It is an absolute POSIX path, or `.` for the
account's default directory. It is independent of Cherry's local managed workspace folder ID.
Every command receives an explicit directory context; optional `cwd` applies to that call only.
Optional `stdin` supplies up to 256 KiB of UTF-8 input, followed by EOF. A fresh non-interactive
shell runs each command even when the SSH connection is reused. The remote directory does not
restrict shell permissions. There is no human terminal, PTY, interactive process session or
automatic handling of command-time password prompts. `timeout_seconds` defaults to 60 and accepts
1–600 seconds. Uploads/downloads have a separate five-minute deadline; connecting still has a
20-second limit. Native command output keeps bounded head and tail buffers.

The file interface provides directory listing, UTF-8 reading/writing, downloading and uploading.
Paths are relative to the profile directory. Listings are bounded to 500 entries, text to 256 KiB,
and transfers to 20 MiB. The browser downloads original bytes only to disposable cache and opens
the existing unified image, text, HTML or document viewer, without creating file/library records.
Closing the preview releases its cache lease; unsupported formats retain system opening through
the same viewer. Agent downloads still publish managed files. Binary files cannot be read as
text. Browser uploads select an existing managed file and confirm the destination. Agent uploads
must resolve a file explicitly available to the admitted turn or its local workspace; models never
choose a device path. Agent downloads publish managed artifacts into that turn's local workspace,
or the library root when unbound. Staging files are owned per transfer and disposed on completion
or failure, with cancellation and target checks retained through managed publication.
Download failures preserve the native `not-started` or `unknown` outcome. A transfer that completed
but failed during managed publication is also reported as `unknown`, without exposing an artifact
or automatically retrying it.

Completed command details show output and the command in two code sections. The summary owns
failure/unknown status and exit code; full execution inputs remain visible before approval.

Writes use a temporary sibling and rename, with replacement disabled unless explicitly requested.
The browser asks before replacing an existing file. Atomic replacement requires the server's
OpenSSH POSIX rename extension; failure does not fall back to deleting the destination. A cancelled
or disconnected write can have an unknown outcome or leave a temporary file. Remote writes do not
have Cherry's local file-version conflict detection, so reread files that may have changed externally.
Basic permission bits are retained; other metadata is not preserved across replacement.

## Trust, scope and lifetime

Profiles initially have no trusted host fingerprint. A user-triggered probe returns a single-use,
five-minute confirmation token for the observed fingerprint and exact profile revision. Trusting it
changes the revision. Every new connection checks the actual peer key, including after an earlier
successful probe. Reuse is limited to the same profile revision, endpoint, username and trusted
fingerprint; edits and trust changes retire that pooled connection. Passwords/private keys are never
sent to an unverified host. A changed host key uses destructive styling, shows the saved and new
fingerprints side by side, and opens a separate destructive system confirmation before replacement.

By default, every AI command requires approval. Global auto approval cannot promote SSH. Users can
grant one-hour access while approving a command to a fixed set of read-only diagnostics: `pwd`,
`whoami`, `id`, `uptime`, `uname`, `df`, and `free`, with limited diagnostic flags. Any other command, shell composition,
nonempty stdin, or custom working directory still requires approval. The SSH approval sheet shows
the complete command, resolved cwd, stdin, target and timeout. Background actions must open the app
for SSH approvals. Revocation, expiry, target changes, profile changes and deletion
cancel affected AI operations. SSH file tools always require their own approval; the command grant
does not promote them. If approval submission fails, only the grant created for that submission is
revoked; a newer selection or replacement grant is preserved. Browser and AI operations share a
connection only through exclusive leases. All conversation bindings and grants disappear when the
process restarts. Draft bindings are copied to the session
allocated by its first send; a failed admission removes that session's temporary binding.

The runtime admits one native operation per target and at most four native operations overall. A busy
target reports busy instead of silently queueing commands. Transfers retain a separate four-operation
bound through local file publication. Profiles are limited to 100, remembered
conversation/draft bindings to 64, pending admission/storage work to 16, and pending trust probes
to 16. Up to four connections can be retained for five idle minutes, with 15-second keepalive
maintenance while the app is scheduled. There are no startup probes or background retries. An explicit command may reconnect once if
a reused connection fails before execution, using only its remaining deadline and rechecking the
profile, target, grant and cancellation state. Unknown outcomes are never replayed. Pooling does not preserve shell state or recover an interrupted task.
The Agent runtime already marks tool side effects unsafe to replay after uncertain recovery.

Cancellation may leave the remote outcome unknown. A remote process can continue after a channel
closes. Long-lived remote jobs require a future remote task protocol and are outside this interface.

## Persistence and distribution

Profiles use a versioned MMKV document, with at most 100 connections and a 1 MiB serialized bound.
Only opaque credential references are stored alongside connection metadata. Passwords/private keys
use `WHEN_UNLOCKED_THIS_DEVICE_ONLY` storage. Cache clearing does not remove profiles. Corrupt or
unsupported stored configuration fails explicitly instead of silently resetting the connection list.

Portable backups include a validated `ssh/profiles.json` snapshot without credential references or
secret values. Restore initializes a separate MMKV store in the candidate storage generation before
activation commits, retaining connection metadata and trust while regenerating credential references
and revisions. Users re-enter credentials after restore, including on the same device. Older backups
without the optional SSH snapshot restore an empty list. A later boot never reapplies the original
restore snapshot over subsequent edits, and rollback retains the previous generation's profiles.
Failed MMKV writes remove newly staged secrets, preserving the previous record.
Backup/restore's storage gate rejects new work while stores are frozen and observes pending SSH
storage/operations before proceeding.

The iOS local-network purpose string covers SSH devices and is localized in all supported languages.
Android currently targets API 36 and uses its existing internet permission; a target-SDK upgrade
must revisit Android's local-network permission requirements.

Adding bundled SSH changes the app's cryptography scope. The previous unconditional
`ITSAppUsesNonExemptEncryption: false` declaration is removed. Before a store release, complete
Apple's encryption questionnaire for the final binary and provide any required documentation or
approved declaration; this implementation does not make an exemption determination. See
[Apple's encryption documentation guidance](https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation).

The current interface covers saved connections, command inputs, human authentication responses,
remote files and bounded connection reuse. The UI prioritizes target context, file inspection,
progress and explicit decisions. PTY terminals, tunnels, remote MCP and durable remote jobs remain
separate future capabilities. Native changes require an updated development client; source review
and lint do not replace authorized dual-platform builds and real-server acceptance.
