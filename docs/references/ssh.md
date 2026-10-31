# SSH connections

SSH is a local connection capability separate from Cherry desktop pairing. Settings > SSH
connections owns saved profiles, identity verification and the manual command panel. A connection
can open a new Agent draft, or the chat composer can select one for its conversation. Opening a draft
does not send a message or run a command.

## Owners

- `modules/ssh` owns libssh2 and the iOS/Android bridges; see its
  [native contract and source pin](../../modules/ssh/README.md).
- `SshProfileService` owns the `ssh_profile` SQLite table. `/ssh-profiles` exposes only profile
  metadata. A profile revision changes on every edit and trust decision.
- `SshRuntime` owns device-only SecureStore credentials, host-probe tokens, operation admission,
  conversation targets, temporary grants, cancellation and draining before database shutdown.
  Its lifecycle dependencies are `DbService` and `KeepAliveCoordinator`; Agent host dependencies
  keep it alive until Agent turns have drained.
- `Backend.ssh` exposes user workflows. Frontend hooks read metadata through Data API and observe
  the runtime's target-selection source. Screens do not access native sessions or stored secrets.
- `ssh_execute` is the AI consumer. Each turn captures the selection identity, connection revision
  and grant. Reselecting the same connection cannot revive an old pending approval.
  Its input schema fixes the connection ID, revision and displayed destination. Execution checks the
  live binding again after loading credentials. Model output previews are capped at 16,000 characters
  per stream. Remote output is untrusted data, never a source of permissions.

## Trust, scope and lifetime

Profiles initially have no trusted host fingerprint. A user-triggered probe returns a single-use,
five-minute confirmation token for the observed fingerprint and exact profile revision. Trusting it
changes the revision. The execution handshake compares the actual key on every command, including
after an earlier successful probe. Passwords/private keys are never sent to an unverified host.

By default, every AI command requires approval. Global auto approval cannot promote SSH. Users can
explicitly grant arbitrary-command access for one hour to the current conversation and connection;
this is not a read-only promise. Revocation, expiry, target changes, profile changes and deletion
cancel affected AI operations. Manual operations use separate native sessions. All conversation
bindings and grants disappear when the process restarts. Draft bindings are copied to the session
allocated by its first send; a failed admission removes that session's temporary binding.

The runtime admits one command per target and at most four native operations overall. A busy
target reports busy instead of silently queueing commands. Profiles are limited to 100, remembered
conversation/draft bindings to 64, pending admission/storage work to 16, and pending trust probes
to 16. There are no startup probes, persistent idle connections, reconnects or background retries.
The Agent runtime already marks tool side effects unsafe to replay after uncertain recovery.

The manual panel's lifetime owns its command; leaving it cancels that operation. Cancellation may
leave the remote outcome unknown. A remote process can continue after a channel closes. Long-lived
remote jobs require a future remote task protocol and are outside this command-only interface.

## Persistence and distribution

Migration `0013_ssh_profiles` adds profiles without changing existing tables. SQLite holds only
opaque credential references. Passwords/private keys use `WHEN_UNLOCKED_THIS_DEVICE_ONLY` storage;
they are not included in database backups. After moving a backup to another device, re-enter the
credentials. Failed database commits remove newly staged secrets, preserving the previous record.
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

The first delivery covers saved connections, manual commands and AI commands. PTY terminals, SFTP,
tunnels, remote MCP and durable remote jobs should add separate consumers/interfaces when needed.
